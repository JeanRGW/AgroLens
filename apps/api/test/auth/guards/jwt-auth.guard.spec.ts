import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { AccountDisabledException } from '../../../src/auth/account-disabled.exception';
import { TokenService } from '../../../src/auth/token.service';
import { UsersRepository, type User } from '../../../src/database/repositories';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$hash',
    fullName: 'Test User',
    phone: null,
    role: 'user',
    disabledAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeRequest(withAuth = true, token = 'valid-jwt'): any {
  return {
    headers: withAuth ? { authorization: `Bearer ${token}` } : {},
    user: undefined,
  };
}

function createMockContext(request: ReturnType<typeof makeRequest>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockTokenService = {
    verifyAccessToken: jest.fn(),
  };

  const mockUsersRepository = {
    findById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(
      mockTokenService as unknown as TokenService,
      mockUsersRepository as unknown as UsersRepository,
    );
  });

  describe('canActivate', () => {
    it('should allow access with valid token and active user', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(makeUser());

      const result = await guard.canActivate(createMockContext(request));
      expect(result).toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.sub).toBe('user-uuid-1');
      expect(request.user.email).toBe('test@example.com');
      expect(request.user.role).toBe('user');
    });

    it('should throw UnauthorizedException when no Authorization header', async () => {
      const request = makeRequest(false);
      await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when header is not Bearer', async () => {
      const request = { headers: { authorization: 'Basic some-token' }, user: undefined };
      await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token verification fails', async () => {
      const request = makeRequest(true, 'expired-or-invalid');
      mockTokenService.verifyAccessToken.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'nonexistent',
        email: 'nobody@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is disabled', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'disabled@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should include the account-disabled code when user is disabled', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'disabled@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      const error = await guard.canActivate(createMockContext(request)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
    });

    it('should attach the current database role instead of the JWT role', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        role: 'admin',
      });
      mockUsersRepository.findById.mockResolvedValue(makeUser({ role: 'user' }));

      await guard.canActivate(createMockContext(request));

      expect(request.user.role).toBe('user');
    });

    it('should attach userRecord from loaded user', async () => {
      const request = makeRequest();
      const loadedUser = makeUser({ fullName: 'Loaded Name', phone: '+5511999999999' });
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(loadedUser);

      await guard.canActivate(createMockContext(request));
      expect(request.user.userRecord).toBeDefined();
      expect(request.user.userRecord.fullName).toBe('Loaded Name');
      expect(request.user.userRecord.phone).toBe('+5511999999999');
    });

    it('should not expose passwordHash in attached user', async () => {
      const request = makeRequest();
      mockTokenService.verifyAccessToken.mockReturnValue({
        sub: 'user-uuid-1',
        email: 'test@example.com',
        role: 'user',
      });
      mockUsersRepository.findById.mockResolvedValue(makeUser());

      await guard.canActivate(createMockContext(request));
      expect((request.user.userRecord as any).passwordHash).toBeUndefined();
    });
  });
});
