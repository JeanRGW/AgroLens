import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  UsersRepository,
  AuditRepository,
  PasswordResetTokensRepository,
  type User,
  type Upload,
  type AccessRepository,
} from '../database/repositories';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { MailService } from '../mail/mail.service';
import { AccountDisabledException } from './account-disabled.exception';
import type { AuthenticatedUser } from './guards/jwt-auth.guard';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  rawRefreshToken: string;
  refreshExpiresAt: Date;
}

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export { assertOwnerOrAdmin, assertCanAccessUpload } from './authorization.service';

export function sanitizeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

/**
 * Real Argon2id hash of an unknowable value, verified (and always failing)
 * when a login names a non-existent account. Comparing the same cost parameters
 * as real accounts equalizes response timing so attackers cannot enumerate
 * registered emails from latency differences.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$02mWg68ioNVBmcBziYzJsw$V+6A2YYWCjAkDTIxfV3DAQlYY9hTN4ha0xcWZum8s6o';

/**
 * Core authentication service.
 *
 * Handles registration, login, refresh token rotation with reuse detection,
 * and logout. Delegates password hashing and JWT management to dedicated services.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditRepository: AuditRepository,
    private readonly resetTokensRepository: PasswordResetTokensRepository,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register a new user with email/password.
   * Returns user profile and tokens.
   */
  async register(dto: RegisterDto, ip: string, userAgent?: string): Promise<AuthResult> {
    // Check for existing user (findByEmail uses citext, so case-insensitive)
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      role: 'user',
    });

    const { accessToken, rawRefreshToken, refreshExpiresAt } = await this.generateTokenPair(
      user,
      ip,
      userAgent,
    );

    this.logger.log(`User registered: ${dto.email}`);

    return {
      user: sanitizeUser(user),
      accessToken,
      rawRefreshToken,
      refreshExpiresAt,
    };
  }

  /**
   * Authenticate a user with email/password.
   * Disabled users cannot log in.
   */
  async login(dto: LoginDto, ip: string, userAgent?: string): Promise<AuthResult> {
    const user = await this.usersRepository.findByEmail(dto.email);

    // Verify against a dummy hash for unknown accounts so both branches pay
    // the same Argon2id cost — and never disclose account state before the
    // password itself has been validated.
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordValid = await this.passwordService.verify(passwordHash, dto.password);
    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.disabledAt) {
      throw new AccountDisabledException('Account is disabled');
    }

    const { accessToken, rawRefreshToken, refreshExpiresAt } = await this.generateTokenPair(
      user,
      ip,
      userAgent,
    );

    this.logger.log(`User logged in: ${dto.email}`);

    return {
      user: sanitizeUser(user),
      accessToken,
      rawRefreshToken,
      refreshExpiresAt,
    };
  }

  /**
   * Rotate refresh token and issue a new access token.
   *
   * Implements reuse detection:
   * - If the presented token is revoked/replaced, the entire token family is revoked
   *   and the request is rejected. This detects stolen refresh tokens.
   * - If the presented token is valid and not revoked, it is rotated normally.
   *
   * @param rawRefreshToken  The raw refresh token string from cookie or body.
   * @param ip               Client IP address.
   * @param userAgent        Client user-agent string.
   */
  async refresh(
    rawRefreshToken: string,
    ip: string,
    userAgent?: string,
  ): Promise<Omit<AuthResult, 'user'>> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);

    // Find token regardless of revoked status for reuse detection
    const refreshToken = await this.usersRepository.findRefreshTokenByHashAny(tokenHash);

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check expiry
    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Reuse detection: if token is revoked, someone reused a stolen token
    if (refreshToken.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for family ${refreshToken.familyId}. Revoking family.`,
      );
      await this.usersRepository.revokeRefreshTokenFamily(refreshToken.familyId);
      // Security signal for the audit trail: records the presenting IP/agent
      // and token family without logging the (worthless) token or any email.
      await this.auditRepository
        .create({
          eventType: 'refresh_token_reuse',
          targetUserId: refreshToken.userId,
          resourceType: 'refresh_token_family',
          resourceId: refreshToken.familyId,
          ipAddress: ip,
          userAgent,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Refresh-token reuse audit event failed for family ${refreshToken.familyId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        });
      // A suspended account keeps reporting the disabled code on every attempt
      // instead of only the first: the presenting token was revoked by an
      // earlier suspension response, so reuse alone must not hide the state.
      const tokenUser = await this.usersRepository.findById(refreshToken.userId);
      if (tokenUser?.disabledAt) {
        throw new AccountDisabledException();
      }
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    // Verify user exists and is not disabled
    const user = await this.usersRepository.findById(refreshToken.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.disabledAt) {
      // Revoke the token for a disabled user
      await this.usersRepository.revokeRefreshToken(refreshToken.id);
      throw new AccountDisabledException();
    }

    // Generate new tokens
    const accessToken = this.tokenService.generateAccessToken(user);
    const newRefresh = this.tokenService.generateRefreshToken();
    const newExpiresAt = this.tokenService.getRefreshExpiresAt();

    // Rotate: replace old token with new one, keeping the same family
    const replacement = await this.usersRepository.replaceRefreshToken(refreshToken.id, {
      userId: user.id,
      tokenHash: newRefresh.tokenHash,
      familyId: refreshToken.familyId,
      userAgent: userAgent ?? null,
      ipAddress: ip,
      expiresAt: newExpiresAt,
    });
    if (!replacement) {
      throw new UnauthorizedException('Refresh token already rotated');
    }

    return {
      accessToken,
      rawRefreshToken: newRefresh.rawToken,
      refreshExpiresAt: newExpiresAt,
    };
  }

  /**
   * Revoke a refresh token (logout).
   * Safe to call even if the token doesn't exist (idempotent).
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const refreshToken = await this.usersRepository.findRefreshTokenByHash(tokenHash);
    if (refreshToken) {
      await this.usersRepository.revokeRefreshToken(refreshToken.id);
    }
  }

  /**
   * Change the current user's password (authenticated).
   *
   * Verifies the current password, stores the new Argon2id hash, and revokes
   * every active refresh-token session for the user so that other devices are
   * signed out. The access token remains valid only for its short TTL.
   *
   * Responses are intentionally generic (never "email unknown") to avoid
   * account enumeration.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    const updated = await this.usersRepository.changePassword(userId, passwordHash, {
      currentPasswordHash: user.passwordHash,
    });
    if (!updated) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.auditRepository
      .create({
        eventType: 'password_changed',
        actorUserId: userId,
        targetUserId: userId,
        ipAddress: ip,
        userAgent,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Password-change audit event failed for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });

    this.logger.log(`User changed password: ${user.email}`);
  }

  /**
   * Self-service password recovery request (unauthenticated).
   *
   * Always returns the same outcome for existing and unknown emails to avoid
   * account enumeration, and only emails real, enabled accounts. Token
   * creation and email delivery failures are logged, never surfaced.
   */
  async requestPasswordReset(email: string, ip: string, userAgent?: string): Promise<void> {
    if (!this.mailService.isEnabled()) {
      throw new ServiceUnavailableException('Password recovery by email is not configured');
    }

    const user = await this.usersRepository.findByEmail(email);
    if (user && !user.disabledAt) {
      // Outstanding links remain usable until expiry or the next password change.
      await this.resetTokensRepository.deleteExpiredForUser(user.id);
      const { rawToken, tokenHash } = this.tokenService.generatePasswordResetToken();
      const created = await this.resetTokensRepository.create(
        user.id,
        tokenHash,
        this.tokenService.getPasswordResetExpiresAt(),
        user.passwordHash,
      );
      if (created) {
        await this.mailService
          .sendPasswordResetEmail(user.email, rawToken)
          .catch((error: unknown) => {
            this.logger.warn(
              `Password reset email delivery failed for user ${user.id}: ${
                error instanceof Error ? error.message : 'unknown error'
              }`,
            );
          });
      }
    }

    await this.auditRepository
      .create({
        eventType: 'password_reset_requested',
        targetUserId: user?.id,
        ipAddress: ip,
        userAgent,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Password reset request audit event failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });

    // Do not log the requested email: an attacker probing addresses would
    // otherwise learn which accounts exist from the server logs.
    this.logger.log('Password reset requested');
  }

  /**
   * Redeem a single-use password reset token (unauthenticated).
   *
   * Consumes the token atomically, stores the new Argon2id hash, and revokes
   * every refresh-token session so all devices must sign in again. Failure
   * responses are intentionally generic — never reveal whether a token was
   * valid, expired, or already consumed.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    ip: string,
    userAgent?: string,
  ): Promise<void> {
    if (!this.mailService.isEnabled()) {
      throw new ServiceUnavailableException('Password recovery by email is not configured');
    }

    const record = await this.resetTokensRepository.findByHash(this.tokenService.hashToken(token));
    if (!record || record.expiresAt.getTime() <= Date.now() || record.consumedAt) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const tokenUser = await this.usersRepository.findById(record.userId);
    if (!tokenUser || tokenUser.disabledAt) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    const updated = await this.usersRepository.changePassword(record.userId, passwordHash, {
      resetTokenId: record.id,
    });
    if (!updated) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    await this.auditRepository
      .create({
        eventType: 'password_reset_completed',
        targetUserId: record.userId,
        ipAddress: ip,
        userAgent,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Password reset audit event failed for user ${record.userId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });

    this.logger.log(`Password reset completed for user ${record.userId}`);
  }

  /**
   * Generate an access token and refresh token pair for a user.
   */
  private async generateTokenPair(
    user: User,
    ip: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; refreshExpiresAt: Date }> {
    const accessToken = this.tokenService.generateAccessToken(user);
    const { rawToken, tokenHash } = this.tokenService.generateRefreshToken();
    const refreshExpiresAt = this.tokenService.getRefreshExpiresAt();

    const refreshToken = await this.usersRepository.insertRefreshToken(
      {
        userId: user.id,
        tokenHash,
        familyId: randomUUID(),
        userAgent: userAgent ?? null,
        ipAddress: ip,
        expiresAt: refreshExpiresAt,
      },
      user.passwordHash,
    );
    if (!refreshToken) throw new UnauthorizedException('Credentials changed; please sign in again');

    return { accessToken, rawRefreshToken: rawToken, refreshExpiresAt };
  }
}
