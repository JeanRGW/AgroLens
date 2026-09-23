import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { AccountDisabledException } from '../../src/auth/account-disabled.exception';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

function mockResponse() {
  const res: any = {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockRequest(overrides: Record<string, unknown> = {}): any {
  const { headers: overrideHeaders, ...rest } = overrides;
  return {
    headers: {
      'user-agent': 'test-agent',
      origin: 'http://localhost:4200',
      ...((overrideHeaders as Record<string, string>) || {}),
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...rest,
  };
}

describe('AuthController', () => {
  let controller: AuthController;
  let registrationEnabled = true;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'REFRESH_COOKIE_NAME') return 'refresh_token';
      if (key === 'REFRESH_COOKIE_SECURE') return false;
      if (key === 'REFRESH_COOKIE_SAME_SITE') return 'lax';
      if (key === 'REFRESH_COOKIE_DOMAIN') return '';
      if (key === 'CORS_ORIGINS') return ['http://localhost:4200'];
      if (key === 'REGISTRATION_ENABLED') return registrationEnabled;
      return defaultValue;
    }),
  };

  const mockJwtGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    jest.clearAllMocks();
    registrationEnabled = true;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    const registerResult = {
      user: { id: 'user-uuid', email: 'new@example.com', fullName: 'New User', role: 'user' },
      accessToken: 'access-jwt',
      rawRefreshToken: 'raw-refresh-80chars',
      refreshExpiresAt: new Date('2025-07-31'),
    };

    it('should reject when registration is explicitly disabled', async () => {
      registrationEnabled = false;
      const req = mockRequest({ headers: { 'x-forwarded-for': '203.0.113.1' } });
      const res = mockResponse();

      await expect(
        controller.register(
          {
            email: 'blocked@example.com',
            password: 'password123',
            fullName: 'Blocked',
            clientType: 'web',
          },
          req,
          res,
        ),
      ).rejects.toMatchObject({
        status: 403,
        response: {
          code: 'REGISTRATION_DISABLED',
          message: 'Public registration is currently disabled',
        },
      });
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should reject when registration config is omitted', async () => {
      mockConfigService.get.mockImplementationOnce((key: string, defaultValue?: unknown) => {
        if (key === 'REGISTRATION_ENABLED') return undefined;
        return defaultValue;
      });
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        controller.register(
          {
            email: 'omitted@example.com',
            password: 'password123',
            fullName: 'Omitted',
            clientType: 'web',
          },
          req,
          res,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should set httpOnly cookie for web client and return user + accessToken', async () => {
      mockAuthService.register.mockResolvedValue(registerResult);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.register(
        {
          email: 'new@example.com',
          password: 'password123',
          fullName: 'New User',
          clientType: 'web',
        },
        req,
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'raw-refresh-80chars', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        expires: registerResult.refreshExpiresAt,
        path: '/',
      });
      // Web should NOT return refreshToken in body
      expect(result).toEqual({
        user: registerResult.user,
        accessToken: registerResult.accessToken,
      });
      expect((result as any).refreshToken).toBeUndefined();
    });

    it('should return refreshToken in body for mobile client', async () => {
      mockAuthService.register.mockResolvedValue(registerResult);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.register(
        {
          email: 'm@bile.com',
          password: 'password123',
          fullName: 'Mobile User',
          clientType: 'mobile',
        },
        req,
        res,
      );

      // Mobile: no cookie
      expect(res.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        user: registerResult.user,
        accessToken: registerResult.accessToken,
        refreshToken: registerResult.rawRefreshToken,
      });
    });

    it('should use the trusted req.ip and ignore forwarding headers', async () => {
      mockAuthService.register.mockResolvedValue(registerResult);
      const req = mockRequest({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } });
      const res = mockResponse();

      await controller.register(
        {
          email: 'fwd@test.com',
          password: 'password123',
          fullName: 'Forwarded',
          clientType: 'mobile',
        },
        req,
        res,
      );

      expect(mockAuthService.register).toHaveBeenCalledWith(
        expect.anything(),
        '127.0.0.1',
        'test-agent',
      );
    });

    it('should pass user-agent header to service', async () => {
      mockAuthService.register.mockResolvedValue(registerResult);
      const req = mockRequest({ headers: { 'user-agent': 'Mozilla/5.0 TestBrowser' } });
      const res = mockResponse();

      await controller.register(
        { email: 'ua@test.com', password: 'password123', fullName: 'UA', clientType: 'mobile' },
        req,
        res,
      );

      expect(mockAuthService.register).toHaveBeenCalledWith(
        expect.anything(),
        '127.0.0.1',
        'Mozilla/5.0 TestBrowser',
      );
    });
  });

  describe('login', () => {
    const loginResult = {
      user: { id: 'user-uuid', email: 'user@example.com', fullName: 'User', role: 'user' },
      accessToken: 'access-jwt',
      rawRefreshToken: 'raw-refresh-80chars',
      refreshExpiresAt: new Date('2025-07-31'),
    };

    it('should set httpOnly cookie for web client', async () => {
      mockAuthService.login.mockResolvedValue(loginResult);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.login(
        { email: 'user@example.com', password: 'secret', clientType: 'web' },
        req,
        res,
      );

      expect(res.cookie).toHaveBeenCalled();
      expect(result).toEqual({ user: loginResult.user, accessToken: loginResult.accessToken });
    });

    it('should return refreshToken in body for mobile client', async () => {
      mockAuthService.login.mockResolvedValue(loginResult);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.login(
        { email: 'm@bile.com', password: 'secret', clientType: 'mobile' },
        req,
        res,
      );

      expect(res.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        user: loginResult.user,
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.rawRefreshToken,
      });
    });

    it('should use req.ip rather than parsing socket or forwarding headers', async () => {
      mockAuthService.login.mockResolvedValue(loginResult);
      const req = {
        headers: { 'user-agent': 'agent' },
        ip: '10.0.0.2',
        socket: { remoteAddress: '10.0.0.2' },
      };
      const res = mockResponse();

      await controller.login(
        { email: 'ip@test.com', password: 'secret', clientType: 'mobile' },
        req as any,
        res,
      );

      expect(mockAuthService.login).toHaveBeenCalledWith(expect.anything(), '10.0.0.2', 'agent');
    });
  });

  describe('refresh', () => {
    const refreshResult = {
      accessToken: 'new-access-jwt',
      rawRefreshToken: 'new-refresh-80chars',
      refreshExpiresAt: new Date('2025-08-30'),
    };

    it('should read refresh token from cookie for web client', async () => {
      mockAuthService.refresh.mockResolvedValue(refreshResult);
      const req = mockRequest({ headers: { cookie: 'refresh_token=cookie-token-value' } });
      const res = mockResponse();

      const result = await controller.refresh({ clientType: 'web' }, req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'cookie-token-value',
        '127.0.0.1',
        'test-agent',
      );
      expect(res.cookie).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'new-access-jwt' });
    });

    it('should read refresh token from body for mobile client', async () => {
      mockAuthService.refresh.mockResolvedValue(refreshResult);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.refresh(
        { refreshToken: 'mobile-token-value', clientType: 'mobile' },
        req,
        res,
      );

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'mobile-token-value',
        '127.0.0.1',
        'test-agent',
      );
      expect(res.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-80chars',
      });
    });

    it('should reject web requests without Origin or Referer', async () => {
      const req = mockRequest({ headers: { origin: undefined } });
      const res = mockResponse();

      await expect(controller.refresh({ clientType: 'web' }, req, res)).rejects.toThrow(
        'Missing request origin',
      );
      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });

    it('should reject web requests from an unconfigured origin', async () => {
      const req = mockRequest({ headers: { origin: 'https://attacker.example' } });
      const res = mockResponse();

      await expect(controller.refresh({ clientType: 'web' }, req, res)).rejects.toThrow(
        'Invalid request origin',
      );
      expect(mockAuthService.refresh).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when no refresh token available for web', async () => {
      const req = mockRequest({ headers: { origin: 'http://localhost:4200' } });
      const res = mockResponse();

      await expect(controller.refresh({ clientType: 'web' }, req, res)).rejects.toThrow(
        'Missing refresh token',
      );
    });

    it('should decode URI-encoded cookie values', async () => {
      mockAuthService.refresh.mockResolvedValue(refreshResult);
      const encoded = encodeURIComponent('token+with/special=chars');
      const req = mockRequest({ headers: { cookie: `refresh_token=${encoded}` } });
      const res = mockResponse();

      await controller.refresh({ clientType: 'web' }, req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'token+with/special=chars',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should parse cookie from multi-cookie header', async () => {
      mockAuthService.refresh.mockResolvedValue(refreshResult);
      const req = mockRequest({
        headers: { cookie: 'other=value; refresh_token=multi-cookie-token; session=abc' },
      });
      const res = mockResponse();

      await controller.refresh({ clientType: 'web' }, req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'multi-cookie-token',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should skip a stale duplicate cookie and succeed with the valid one', async () => {
      mockAuthService.refresh.mockImplementation(async (token: string) => {
        if (token === 'valid-token') return refreshResult;
        throw new UnauthorizedException('Invalid refresh token');
      });
      const req = mockRequest({
        headers: { cookie: 'refresh_token=stale-token; refresh_token=valid-token' },
      });
      const res = mockResponse();

      const result = await controller.refresh({ clientType: 'web' }, req, res);

      expect(mockAuthService.refresh).toHaveBeenNthCalledWith(
        1,
        'stale-token',
        expect.anything(),
        expect.anything(),
      );
      expect(mockAuthService.refresh).toHaveBeenNthCalledWith(
        2,
        'valid-token',
        expect.anything(),
        expect.anything(),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        refreshResult.rawRefreshToken,
        expect.anything(),
      );
      expect(result).toEqual({ accessToken: 'new-access-jwt' });
    });

    it('should surface the first error when every presented cookie is rejected', async () => {
      mockAuthService.refresh.mockRejectedValue(new UnauthorizedException('Invalid refresh token'));
      const req = mockRequest({
        headers: { cookie: 'refresh_token=stale-token; refresh_token=unknown-token' },
      });
      const res = mockResponse();

      await expect(controller.refresh({ clientType: 'web' }, req, res)).rejects.toThrow(
        'Invalid refresh token',
      );
      expect(mockAuthService.refresh).toHaveBeenCalledTimes(2);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should prefer the disabled error when a stale cookie fails first', async () => {
      mockAuthService.refresh.mockImplementation(async (token: string) => {
        if (token === 'disabled-token') throw new AccountDisabledException();
        throw new UnauthorizedException('Invalid refresh token');
      });
      const req = mockRequest({
        headers: { cookie: 'refresh_token=stale-token; refresh_token=disabled-token' },
      });
      const res = mockResponse();

      const error = await controller
        .refresh({ clientType: 'web' }, req, res)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
      expect(mockAuthService.refresh).toHaveBeenCalledTimes(2);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should prefer the disabled error when it comes first', async () => {
      mockAuthService.refresh.mockImplementation(async (token: string) => {
        if (token === 'disabled-token') throw new AccountDisabledException();
        throw new UnauthorizedException('Invalid refresh token');
      });
      const req = mockRequest({
        headers: { cookie: 'refresh_token=disabled-token; refresh_token=stale-token' },
      });
      const res = mockResponse();

      const error = await controller
        .refresh({ clientType: 'web' }, req, res)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
      expect(mockAuthService.refresh).toHaveBeenCalledTimes(2);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should reject web logout without Origin or Referer', async () => {
      const req = mockRequest({
        headers: { origin: undefined, cookie: 'refresh_token=logout-token' },
      });
      const res = mockResponse();

      await expect(controller.logout({ clientType: 'web' }, req, res)).rejects.toThrow(
        'Missing request origin',
      );
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });

    it('should clear cookie for web client and call logout with cookie token', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockRequest({
        headers: { origin: 'http://localhost:4200', cookie: 'refresh_token=logout-token' },
      });
      const res = mockResponse();

      const result = await controller.logout({ clientType: 'web' }, req, res);

      expect(mockAuthService.logout).toHaveBeenCalledWith('logout-token');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('should use body token for mobile client and not clear cookie', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.logout(
        { refreshToken: 'mobile-logout-token', clientType: 'mobile' },
        req,
        res,
      );

      expect(mockAuthService.logout).toHaveBeenCalledWith('mobile-logout-token');
      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('should be idempotent when token not found', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockRequest({ headers: {} }); // no cookie
      const res = mockResponse();

      const result = await controller.logout({ clientType: 'web' }, req, res);

      // Should still clear the cookie even without a token
      expect(res.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('should revoke every presented duplicate cookie', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockRequest({
        headers: {
          origin: 'http://localhost:4200',
          cookie: 'refresh_token=stale-token; refresh_token=valid-token',
        },
      });
      const res = mockResponse();

      const result = await controller.logout({ clientType: 'web' }, req, res);

      expect(mockAuthService.logout).toHaveBeenNthCalledWith(1, 'stale-token');
      expect(mockAuthService.logout).toHaveBeenNthCalledWith(2, 'valid-token');
      expect(res.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  describe('me', () => {
    it('should return user record from authenticated request', async () => {
      const currentUser = {
        sub: 'user-uuid',
        email: 'test@example.com',
        role: 'user',
        userRecord: {
          id: 'user-uuid',
          email: 'test@example.com',
          fullName: 'Test',
          phone: null,
          role: 'user',
          disabledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const result = await controller.me(currentUser as any);
      expect(result).toEqual({ user: currentUser.userRecord });
    });
  });

  describe('changePassword', () => {
    it('should delegate to the auth service with the authenticated user id and request context', async () => {
      mockAuthService.changePassword.mockResolvedValue(undefined);
      const currentUser = { sub: 'user-uuid', email: 'a@b.com', role: 'user' };
      const req = mockRequest({ headers: { 'user-agent': 'Agent/1.0' } });

      const result = await controller.changePassword(
        { currentPassword: 'old-pass', newPassword: 'new-pass-123' },
        currentUser as any,
        req,
      );

      expect(result).toEqual({ message: 'Password changed' });
      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-uuid',
        'old-pass',
        'new-pass-123',
        '127.0.0.1',
        'Agent/1.0',
      );
    });
  });

  describe('forgotPassword', () => {
    it('answers 202 and delegates to the service with the request IP', async () => {
      const req = mockRequest({ headers: { 'user-agent': 'Agent/1.0' } });

      const result = await controller.forgotPassword({ email: 'user@example.com' }, req);

      expect(result).toEqual({ message: 'If the email is registered, a reset link has been sent' });
      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(
        'user@example.com',
        '127.0.0.1',
        'Agent/1.0',
      );
    });
  });

  describe('resetPassword', () => {
    it('delegates token and new password to the service', async () => {
      const req = mockRequest({});

      const result = await controller.resetPassword(
        { token: 'reset-token', newPassword: 'new-password-123' },
        req,
      );

      expect(result).toEqual({ message: 'Password reset successfully. Please sign in.' });
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        'reset-token',
        'new-password-123',
        '127.0.0.1',
        'test-agent',
      );
    });
  });
});
