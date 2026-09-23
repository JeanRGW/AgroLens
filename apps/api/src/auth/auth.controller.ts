import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { refreshSchema, type RefreshDto } from './dto/refresh.dto';
import { logoutSchema, type LogoutDto } from './dto/logout.dto';
import { changePasswordSchema, type ChangePasswordDto } from './dto/change-password.dto';
import { forgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto';
import { resetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';
import { JwtAuthGuard, type AuthenticatedUser } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { CriticalThrottle } from '../rate-limit/rate-limit.guard';
import { AccountDisabledException } from './account-disabled.exception';

const REGISTER_BODY_SCHEMA = {
  type: 'object',
  required: ['email', 'password', 'fullName'],
  properties: {
    email: { type: 'string', format: 'email', example: 'user@example.com' },
    password: { type: 'string', minLength: 8, maxLength: 128, example: 'securepassword' },
    fullName: { type: 'string', minLength: 1, maxLength: 200, example: 'Joao Silva' },
    phone: { type: 'string', maxLength: 30, example: '+5511999999999' },
    clientType: { type: 'string', enum: ['web', 'mobile'], default: 'web' },
  },
};

const LOGIN_BODY_SCHEMA = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', example: 'user@example.com' },
    password: { type: 'string', example: 'securepassword' },
    clientType: { type: 'string', enum: ['web', 'mobile'], default: 'web' },
  },
};

const REFRESH_BODY_SCHEMA = {
  type: 'object',
  properties: {
    refreshToken: {
      type: 'string',
      description: 'Required for mobile clients; web clients use httpOnly cookie',
    },
    clientType: { type: 'string', enum: ['web', 'mobile'], default: 'web' },
  },
};

const LOGOUT_BODY_SCHEMA = {
  type: 'object',
  properties: {
    refreshToken: {
      type: 'string',
      description: 'Required for mobile clients; web clients use httpOnly cookie',
    },
    clientType: { type: 'string', enum: ['web', 'mobile'], default: 'web' },
  },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly cookieSecure: boolean;
  private readonly cookieSameSite: 'lax' | 'strict' | 'none';
  private readonly cookieDomain: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.cookieName = this.configService.get<string>('REFRESH_COOKIE_NAME', 'refresh_token');
    this.cookieSecure = this.configService.get<boolean>('REFRESH_COOKIE_SECURE', false);
    this.cookieSameSite = this.configService.get<'lax' | 'strict' | 'none'>(
      'REFRESH_COOKIE_SAME_SITE',
      'lax',
    );
    this.cookieDomain = this.configService.get<string>('REFRESH_COOKIE_DOMAIN', '');
  }

  private isRegistrationEnabled(): boolean {
    return this.configService.get<boolean>('REGISTRATION_ENABLED', false);
  }

  // ── POST /auth/register ─────────────────────────────────────────

  @Post('register')
  @CriticalThrottle()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user with email/password' })
  @ApiBody({ schema: REGISTER_BODY_SCHEMA })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({
    status: 403,
    description: 'Public registration is currently disabled',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'REGISTRATION_DISABLED' },
        message: { type: 'string', example: 'Public registration is currently disabled' },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.isRegistrationEnabled()) {
      throw new ForbiddenException({
        code: 'REGISTRATION_DISABLED',
        message: 'Public registration is currently disabled',
      });
    }

    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.register(dto, ip, userAgent);

    if (dto.clientType === 'web') {
      this.setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);
      return { user: result.user, accessToken: result.accessToken };
    }

    // Mobile: return refresh token in response body
    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.rawRefreshToken,
    };
  }

  // ── POST /auth/login ────────────────────────────────────────────

  @Post('login')
  @CriticalThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ schema: LOGIN_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, ip, userAgent);

    if (dto.clientType === 'web') {
      this.setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);
      return { user: result.user, accessToken: result.accessToken };
    }

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.rawRefreshToken,
    };
  }

  // ── POST /auth/refresh ──────────────────────────────────────────

  @Post('refresh')
  @CriticalThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate refresh token and issue a new access token',
    description:
      'Web clients: reads refresh token from httpOnly cookie, sets a new cookie. ' +
      'When several same-name cookies are present, each is tried in order. ' +
      'Mobile clients: reads refresh token from request body, returns new refresh token in JSON.',
  })
  @ApiBody({ schema: REFRESH_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.clientType === 'web') {
      this.validateWebOrigin(req);
    }
    // Browsers send every same-name cookie, so a stale duplicate (e.g. left
    // behind by an earlier cookie-domain configuration) arrives alongside the
    // current one. Try each presented token so the stale value cannot shadow
    // the valid session.
    let rawRefreshTokens: string[] = [];
    if (dto.clientType === 'web') {
      rawRefreshTokens = this.getRefreshTokensFromCookies(req);
    } else if (dto.refreshToken) {
      rawRefreshTokens = [dto.refreshToken];
    }

    if (rawRefreshTokens.length === 0) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'];
    let firstError: unknown;
    // A suspension must never be shadowed by a stale duplicate cookie: if any
    // presented token reports a disabled account, that error wins so clients
    // end the session instead of lingering on the first failure.
    let disabledError: unknown;
    for (const rawRefreshToken of rawRefreshTokens) {
      try {
        const result = await this.authService.refresh(rawRefreshToken, ip, userAgent);
        if (dto.clientType === 'web') {
          this.setRefreshCookie(res, result.rawRefreshToken, result.refreshExpiresAt);
          return { accessToken: result.accessToken };
        }
        return {
          accessToken: result.accessToken,
          refreshToken: result.rawRefreshToken,
        };
      } catch (error) {
        firstError ??= error;
        if (error instanceof AccountDisabledException) disabledError ??= error;
      }
    }
    throw disabledError ?? firstError;
  }

  // ── POST /auth/logout ───────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke current refresh token / session',
    description:
      'Web clients: reads refresh token from httpOnly cookie and clears it. ' +
      'Mobile clients: reads refresh token from request body. Idempotent: safe to call even without a token.',
  })
  @ApiBody({ schema: LOGOUT_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.clientType === 'web') {
      this.validateWebOrigin(req);
    }
    let rawRefreshTokens: string[] = [];
    if (dto.clientType === 'web') {
      rawRefreshTokens = this.getRefreshTokensFromCookies(req);
    } else if (dto.refreshToken) {
      rawRefreshTokens = [dto.refreshToken];
    }

    for (const rawRefreshToken of rawRefreshTokens) {
      await this.authService.logout(rawRefreshToken);
    }

    if (dto.clientType === 'web') {
      this.clearRefreshCookie(res);
    }

    return { message: 'Logged out' };
  }

  // ── GET /auth/me ────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      user: currentUser.userRecord,
    };
  }

  // ── POST /auth/change-password ──────────────────────────────────

  @Post('change-password')
  @CriticalThrottle()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the authenticated user password',
    description:
      'Verifies the current password, stores the new one, and revokes all ' +
      'refresh-token sessions for the user so other devices must sign in again.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', example: 'old-password' },
        newPassword: {
          type: 'string',
          minLength: 8,
          maxLength: 128,
          example: 'new-secure-password',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Invalid current password or not authenticated' })
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.authService.changePassword(
      currentUser.sub,
      dto.currentPassword,
      dto.newPassword,
      this.extractIp(req),
      req.headers['user-agent'],
    );
    return { message: 'Password changed' };
  }

  // ── POST /auth/forgot-password ────────────────────────────────────

  @Post('forgot-password')
  @CriticalThrottle()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Always answers 202 for known and unknown emails to prevent account ' +
      'enumeration. Emails a single-use reset link when the account exists ' +
      'and is enabled. Returns 503 when email recovery is not configured.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email', example: 'user@example.com' } },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Accepted (indistinguishable for known/unknown emails)',
  })
  @ApiResponse({ status: 503, description: 'Email recovery is not configured' })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @Req() req: Request,
  ) {
    await this.authService.requestPasswordReset(
      dto.email,
      this.extractIp(req),
      req.headers['user-agent'],
    );
    return { message: 'If the email is registered, a reset link has been sent' };
  }

  // ── POST /auth/reset-password ─────────────────────────────────────

  @Post('reset-password')
  @CriticalThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with a reset token',
    description:
      'Consumes the single-use token from the reset email, stores the new ' +
      'password, and revokes all refresh-token sessions for the user.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'newPassword'],
      properties: {
        token: { type: 'string', example: 'reset-token-from-email' },
        newPassword: {
          type: 'string',
          minLength: 8,
          maxLength: 128,
          example: 'new-secure-password',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used token' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    await this.authService.resetPassword(
      dto.token,
      dto.newPassword,
      this.extractIp(req),
      req.headers['user-agent'],
    );
    return { message: 'Password reset successfully. Please sign in.' };
  }

  // ── Private helpers ─────────────────────────────────────────────

  // ponytail: Origin/Referer validation protects cookie-authenticated web mutations without
  // requiring a CSRF token that mobile clients would need to carry.
  private validateWebOrigin(req: Request): void {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!origin && !referer) {
      throw new ForbiddenException('Missing request origin');
    }
    const configuredOrigins = this.configService.get<string[]>('CORS_ORIGINS', []);
    const source = origin ?? referer;
    if (typeof source !== 'string') {
      throw new ForbiddenException('Invalid request origin');
    }
    let sourceOrigin: string;
    try {
      sourceOrigin = new URL(source).origin;
    } catch {
      throw new ForbiddenException('Invalid request origin');
    }
    if (!configuredOrigins.includes(sourceOrigin)) {
      throw new ForbiddenException('Invalid request origin');
    }
  }

  private setRefreshCookie(res: Response, rawToken: string, expiresAt: Date): void {
    res.cookie(this.cookieName, rawToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      expires: expiresAt,
      path: '/',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      path: '/',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  private getRefreshTokensFromCookies(req: Request): string[] {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return [];
    const prefix = `${this.cookieName}=`;
    const tokens: string[] = [];
    for (const part of cookieHeader.split(';')) {
      const cookie = part.trim();
      if (!cookie.startsWith(prefix)) continue;
      try {
        const value = decodeURIComponent(cookie.slice(prefix.length));
        if (value) tokens.push(value);
      } catch {
        // Ignore a malformed entry; other same-name cookies may still be valid.
      }
    }
    return tokens;
  }

  private extractIp(req: Request): string {
    return req.ip ?? 'unknown';
  }
}
