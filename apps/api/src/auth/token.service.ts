import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface GeneratedRefreshToken {
  rawToken: string;
  tokenHash: string;
}

/**
 * Manages JWT access tokens and opaque refresh tokens.
 *
 * Access tokens are short-lived JWTs with user claims.
 * Refresh tokens are high-entropy opaque strings; only the SHA-256 hash is stored in the database.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a signed JWT access token containing user id, email, and role.
   */
  generateAccessToken(user: { id: string; email: string; role: string }): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Verify and decode an access token. Throws if invalid or expired.
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token);
  }

  /**
   * Generate a high-entropy opaque refresh token.
   * Returns the raw token (to send to the client) and its SHA-256 hash (to store in DB).
   */
  generateRefreshToken(): GeneratedRefreshToken {
    const rawToken = randomBytes(40).toString('hex'); // 80 hex chars
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  /**
   * Compute the SHA-256 hash of a raw refresh token.
   */
  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Calculate the refresh token expiry date based on configured TTL.
   */
  getRefreshExpiresAt(): Date {
    const days = this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS', 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }

  /**
   * Generate a single-use password reset token (32 random bytes, base64url).
   * Returns the raw token (emailed to the user) and its SHA-256 hash for storage.
   */
  generatePasswordResetToken(): GeneratedRefreshToken {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  /**
   * Calculate the password reset token expiry based on configured TTL.
   */
  getPasswordResetExpiresAt(): Date {
    const minutes = this.configService.get<number>('MAIL_PASSWORD_RESET_TTL_MINUTES', 30);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
    return expiresAt;
  }
}
