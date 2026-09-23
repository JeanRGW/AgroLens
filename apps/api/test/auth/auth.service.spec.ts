import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { AccountDisabledException } from '../../src/auth/account-disabled.exception';
import { PasswordService } from '../../src/auth/password.service';
import { TokenService } from '../../src/auth/token.service';
import { MailService } from '../../src/mail/mail.service';
import {
  UsersRepository,
  AuditRepository,
  PasswordResetTokensRepository,
  type User,
  type RefreshToken,
} from '../../src/database/repositories';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$mock',
    fullName: 'Test User',
    phone: null,
    role: 'user',
    disabledAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-uuid-1',
    userId: 'user-uuid-1',
    tokenHash: 'abc123hash',
    familyId: 'family-uuid-1',
    userAgent: 'test-agent',
    ipAddress: '127.0.0.1',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    revokedAt: null,
    replacedByTokenId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    changePassword: jest.fn(),
    insertRefreshToken: jest.fn(),
    findRefreshTokenByHash: jest.fn(),
    findRefreshTokenByHashAny: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeRefreshTokenFamily: jest.fn(),
    revokeAllRefreshTokens: jest.fn(),
    replaceRefreshToken: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn().mockResolvedValue({}),
  };

  const mockPasswordService = {
    hash: jest.fn().mockResolvedValue('$argon2id$hashed'),
    verify: jest.fn().mockResolvedValue(true),
  };

  const mockTokenService = {
    generateAccessToken: jest.fn().mockReturnValue('access-token-jwt'),
    verifyAccessToken: jest.fn(),
    generateRefreshToken: jest.fn().mockReturnValue({
      rawToken: 'raw-refresh-token-80chars',
      tokenHash: 'sha256-hash-of-raw-token',
    }),
    hashToken: jest.fn().mockReturnValue('sha256-hash-of-raw-token'),
    getRefreshExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    generatePasswordResetToken: jest.fn().mockReturnValue({
      rawToken: 'raw-password-reset-token',
      tokenHash: 'sha256-hash-of-reset-token',
    }),
    getPasswordResetExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 30 * 60 * 1000)),
  };

  const mockResetTokensRepository = {
    create: jest.fn().mockResolvedValue(true),
    findByHash: jest.fn(),
    deleteExpiredForUser: jest.fn().mockResolvedValue(undefined),
  };

  const mockMailService = {
    isEnabled: jest.fn().mockReturnValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    buildResetUrl: jest.fn().mockReturnValue('https://app.agrolens.rgw.app/reset-password?token=x'),
    getTestMessages: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Restore default implementations
    mockPasswordService.hash.mockResolvedValue('$argon2id$hashed');
    mockPasswordService.verify.mockResolvedValue(true);
    mockTokenService.generateAccessToken.mockReturnValue('access-token-jwt');
    mockTokenService.generateRefreshToken.mockReturnValue({
      rawToken: 'raw-refresh-token-80chars',
      tokenHash: 'sha256-hash-of-raw-token',
    });
    mockTokenService.hashToken.mockReturnValue('sha256-hash-of-raw-token');
    mockTokenService.getRefreshExpiresAt.mockReturnValue(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );
    mockTokenService.generatePasswordResetToken.mockReturnValue({
      rawToken: 'raw-password-reset-token',
      tokenHash: 'sha256-hash-of-reset-token',
    });
    mockTokenService.getPasswordResetExpiresAt.mockReturnValue(
      new Date(Date.now() + 30 * 60 * 1000),
    );
    mockResetTokensRepository.findByHash.mockReset();
    mockResetTokensRepository.create.mockResolvedValue(true);
    mockUsersRepository.changePassword.mockResolvedValue(makeUser());
    mockUsersRepository.insertRefreshToken.mockResolvedValue({});
    mockMailService.isEnabled.mockReturnValue(true);
    mockMailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersRepository, useValue: mockUsersRepository },
        { provide: AuditRepository, useValue: mockAuditRepository },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: PasswordResetTokensRepository, useValue: mockResetTokensRepository },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ────────────────────────────────────────────────────

  describe('register', () => {
    it('should create a user and return auth result', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);
      mockUsersRepository.create.mockResolvedValue(makeUser());
      mockUsersRepository.insertRefreshToken.mockResolvedValue({});

      const result = await service.register(
        {
          email: 'new@example.com',
          password: 'password123',
          fullName: 'New User',
          clientType: 'web',
        },
        '127.0.0.1',
      );

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.rawRefreshToken).toBe('raw-refresh-token-80chars');
      expect(mockPasswordService.hash).toHaveBeenCalledWith('password123');
      expect(mockUsersRepository.create).toHaveBeenCalled();
      expect(mockUsersRepository.insertRefreshToken).toHaveBeenCalled();
    });

    it('should reject duplicate email with ConflictException', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.register(
          {
            email: 'test@example.com',
            password: 'password123',
            fullName: 'Test',
            clientType: 'web',
          },
          '127.0.0.1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should not include passwordHash in the returned user', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);
      mockUsersRepository.create.mockResolvedValue(makeUser());
      mockUsersRepository.insertRefreshToken.mockResolvedValue({});

      const result = await service.register(
        {
          email: 'new@example.com',
          password: 'password123',
          fullName: 'New User',
          clientType: 'web',
        },
        '127.0.0.1',
      );

      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  // ── login ───────────────────────────────────────────────────────

  describe('login', () => {
    it('should return auth result on valid credentials', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());
      mockPasswordService.verify.mockResolvedValue(true);

      const result = await service.login(
        { email: 'test@example.com', password: 'correct', clientType: 'web' },
        '127.0.0.1',
      );

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.rawRefreshToken).toBe('raw-refresh-token-80chars');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should reject with generic message for non-existent email', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);

      await expect(
        service.login(
          { email: 'nobody@example.com', password: 'password', clientType: 'web' },
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should equalize timing for unknown accounts by verifying against a dummy hash', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.login(
          { email: 'nobody@example.com', password: 'password', clientType: 'web' },
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid email or password');

      // The dummy hash must be verified (not skipped) for unknown accounts.
      expect(mockPasswordService.verify).toHaveBeenCalledTimes(1);
      expect(mockPasswordService.verify).toHaveBeenCalledWith(
        expect.stringMatching(/^\$argon2id\$/),
        'password',
      );
      expect(mockUsersRepository.insertRefreshToken).not.toHaveBeenCalled();
    });

    it('should reject with generic message for wrong password', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.login(
          { email: 'test@example.com', password: 'wrong', clientType: 'web' },
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should reject disabled users', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      await expect(
        service.login(
          { email: 'test@example.com', password: 'correct', clientType: 'web' },
          '127.0.0.1',
        ),
      ).rejects.toThrow('Account is disabled');
    });

    it('should include the account-disabled code when rejecting disabled users', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      const error = await service
        .login({ email: 'test@example.com', password: 'correct', clientType: 'web' }, '127.0.0.1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
    });

    it('should still verify the password before revealing a disabled account', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser({ disabledAt: new Date() }));
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.login(
          { email: 'test@example.com', password: 'wrong', clientType: 'web' },
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid email or password');
      // Disabled state must not leak when the password is also wrong.
      expect(mockUsersRepository.insertRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ── refresh ─────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should rotate tokens for a valid non-revoked refresh token', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockUsersRepository.replaceRefreshToken.mockResolvedValue({});

      const result = await service.refresh('raw-refresh-token', '127.0.0.1');

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.rawRefreshToken).toBe('raw-refresh-token-80chars');
      expect(mockUsersRepository.replaceRefreshToken).toHaveBeenCalled();
    });

    it('should reject when another request already rotated the token', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockUsersRepository.replaceRefreshToken.mockResolvedValue(undefined);

      await expect(service.refresh('raw-refresh-token', '127.0.0.1')).rejects.toThrow(
        'Refresh token already rotated',
      );
      expect(mockUsersRepository.revokeRefreshTokenFamily).not.toHaveBeenCalled();
    });

    it('should reject an unknown refresh token', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(undefined);

      await expect(service.refresh('unknown-token', '127.0.0.1')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should reject an expired refresh token', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ expiresAt: new Date('2020-01-01') }),
      );

      await expect(service.refresh('expired-token', '127.0.0.1')).rejects.toThrow(
        'Refresh token expired',
      );
    });

    it('should detect reuse of a revoked token and revoke the family', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      mockUsersRepository.revokeRefreshTokenFamily.mockResolvedValue(undefined);

      await expect(service.refresh('revoked-token', '127.0.0.1')).rejects.toThrow(
        'Refresh token reuse detected; session revoked',
      );
      expect(mockUsersRepository.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-uuid-1');
    });

    it('should persist refresh-token reuse as an audit event without storing an email', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      mockUsersRepository.revokeRefreshTokenFamily.mockResolvedValue(undefined);

      await expect(service.refresh('revoked-token', '127.0.0.1', 'test-agent')).rejects.toThrow(
        'Refresh token reuse detected; session revoked',
      );

      expect(mockAuditRepository.create).toHaveBeenCalledTimes(1);
      const event = mockAuditRepository.create.mock.calls[0][0];
      expect(event.eventType).toBe('refresh_token_reuse');
      expect(event.targetUserId).toBe('user-uuid-1');
      expect(event.resourceId).toBe('family-uuid-1');
      expect(event.ipAddress).toBe('127.0.0.1');
      expect(event.userAgent).toBe('test-agent');
      // No email is attached to the event (the presenter is unknown).
      expect(JSON.stringify(event)).not.toContain('@');
    });

    it('should still reject reuse when the audit write fails', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      mockUsersRepository.revokeRefreshTokenFamily.mockResolvedValue(undefined);
      mockAuditRepository.create.mockRejectedValueOnce(new Error('audit down'));

      await expect(service.refresh('revoked-token', '127.0.0.1')).rejects.toThrow(
        'Refresh token reuse detected; session revoked',
      );
      expect(mockUsersRepository.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-uuid-1');
    });

    it('should not audit a normal rotation as reuse', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockUsersRepository.replaceRefreshToken.mockResolvedValue({});

      await service.refresh('raw-refresh-token', '127.0.0.1');

      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });

    it('should reject if user is disabled', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));
      mockUsersRepository.revokeRefreshToken.mockResolvedValue(undefined);

      await expect(service.refresh('valid-token', '127.0.0.1')).rejects.toThrow(
        'User account is disabled',
      );
      expect(mockUsersRepository.revokeRefreshToken).toHaveBeenCalledWith('rt-uuid-1');
    });

    it('should include the account-disabled code when the user is disabled', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));
      mockUsersRepository.revokeRefreshToken.mockResolvedValue(undefined);

      const error = await service.refresh('valid-token', '127.0.0.1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
    });

    it('should keep the disabled code when a revoked token belongs to a disabled user', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      mockUsersRepository.revokeRefreshTokenFamily.mockResolvedValue(undefined);
      mockUsersRepository.findById.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      const error = await service.refresh('valid-token', '127.0.0.1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccountDisabledException);
      expect((error as AccountDisabledException).getResponse()).toMatchObject({
        code: 'account_disabled',
        statusCode: 401,
      });
      expect(mockUsersRepository.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-uuid-1');
    });

    it('should keep the reuse message when a revoked token belongs to an active user', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(
        makeRefreshToken({ revokedAt: new Date() }),
      );
      mockUsersRepository.revokeRefreshTokenFamily.mockResolvedValue(undefined);
      mockUsersRepository.findById.mockResolvedValue(makeUser());

      await expect(service.refresh('valid-token', '127.0.0.1')).rejects.toThrow(
        'Refresh token reuse detected; session revoked',
      );
    });

    it('should reject if user no longer exists', async () => {
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(service.refresh('valid-token', '127.0.0.1')).rejects.toThrow('User not found');
    });

    it('should keep the same token family on rotation', async () => {
      const existingToken = makeRefreshToken({ familyId: 'existing-family' });
      mockUsersRepository.findRefreshTokenByHashAny.mockResolvedValue(existingToken);
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockUsersRepository.replaceRefreshToken.mockResolvedValue({});

      await service.refresh('raw-token', '127.0.0.1');

      // The replaceRefreshToken call should use the same family ID
      const insertCall = mockUsersRepository.replaceRefreshToken.mock.calls[0];
      expect(insertCall[1].familyId).toBe('existing-family');
    });
  });

  // ── logout ──────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke the refresh token when found', async () => {
      mockUsersRepository.findRefreshTokenByHash.mockResolvedValue(makeRefreshToken());
      mockUsersRepository.revokeRefreshToken.mockResolvedValue(undefined);

      await service.logout('raw-token');
      expect(mockUsersRepository.revokeRefreshToken).toHaveBeenCalledWith('rt-uuid-1');
    });

    it('should be idempotent when token is not found', async () => {
      mockUsersRepository.findRefreshTokenByHash.mockResolvedValue(undefined);

      await service.logout('unknown-token');
      expect(mockUsersRepository.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ── changePassword ──────────────────────────────────────────────

  describe('changePassword', () => {
    it('should verify current password, hash the new one, update, and revoke all sessions', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockPasswordService.verify.mockResolvedValue(true);
      mockPasswordService.hash.mockResolvedValue('$argon2id$newhash');
      mockUsersRepository.changePassword.mockResolvedValue(
        makeUser({ passwordHash: '$argon2id$newhash' }),
      );
      mockUsersRepository.revokeAllRefreshTokens.mockResolvedValue(undefined);

      await service.changePassword('user-uuid-1', 'old-password', 'new-password-123', '127.0.0.1');

      expect(mockPasswordService.verify).toHaveBeenCalledWith('$argon2id$mock', 'old-password');
      expect(mockPasswordService.hash).toHaveBeenCalledWith('new-password-123');
      expect(mockUsersRepository.changePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        '$argon2id$newhash',
        {
          currentPasswordHash: '$argon2id$mock',
        },
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'password_changed', actorUserId: 'user-uuid-1' }),
      );
    });

    it('should reject with a generic message when the current password is wrong', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('user-uuid-1', 'wrong', 'new-password-123'),
      ).rejects.toThrow('Invalid current password');
      expect(mockUsersRepository.changePassword).not.toHaveBeenCalled();
      expect(mockUsersRepository.revokeAllRefreshTokens).not.toHaveBeenCalled();
    });

    it('should reject when the user does not exist without updating anything', async () => {
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(service.changePassword('missing', 'pw', 'new-password-123')).rejects.toThrow(
        'Invalid credentials',
      );
      expect(mockUsersRepository.changePassword).not.toHaveBeenCalled();
    });

    it('should not audit a failed change attempt', async () => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('user-uuid-1', 'wrong', 'new-password-123'),
      ).rejects.toThrow();
      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });
  });

  // ── requestPasswordReset ──────────────────────────────────────────

  describe('requestPasswordReset', () => {
    it('emails a reset link to an existing enabled user without revealing the outcome', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());

      await service.requestPasswordReset('test@example.com', '127.0.0.1');

      expect(mockResetTokensRepository.deleteExpiredForUser).toHaveBeenCalledWith('user-uuid-1');
      expect(mockResetTokensRepository.create).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'raw-password-reset-token',
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'password_reset_requested',
          targetUserId: 'user-uuid-1',
        }),
      );
    });

    it('skips token creation and email for unknown emails but still returns successfully', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(undefined);

      await service.requestPasswordReset('unknown@example.com', '127.0.0.1');

      expect(mockResetTokensRepository.create).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('skips disabled accounts without revealing their existence', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser({ disabledAt: new Date() }));

      await service.requestPasswordReset('disabled@example.com', '127.0.0.1');

      expect(mockResetTokensRepository.create).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('logs but never throws when email delivery fails', async () => {
      mockUsersRepository.findByEmail.mockResolvedValue(makeUser());
      mockMailService.sendPasswordResetEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.requestPasswordReset('test@example.com', '127.0.0.1'),
      ).resolves.toBeUndefined();
    });

    it('throws 503 when mail is not enabled', async () => {
      mockMailService.isEnabled.mockReturnValue(false);

      await expect(service.requestPasswordReset('test@example.com', '127.0.0.1')).rejects.toThrow(
        'Password recovery by email is not configured',
      );
    });
  });

  // ── resetPassword ─────────────────────────────────────────────────

  describe('resetPassword', () => {
    beforeEach(() => {
      mockUsersRepository.findById.mockResolvedValue(makeUser());
    });
    function makeResetRecord() {
      return {
        id: 'reset-uuid-1',
        userId: 'user-uuid-1',
        tokenHash: 'sha256-hash-of-reset-token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        consumedAt: null,
        createdAt: new Date(),
      };
    }

    it('consumes the token, updates the password hash, and revokes all sessions', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue(makeResetRecord());
      mockUsersRepository.changePassword.mockResolvedValue(makeUser());

      await service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1');

      expect(mockPasswordService.hash).toHaveBeenCalledWith('new-password-123');
      expect(mockUsersRepository.changePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        '$argon2id$hashed',
        {
          resetTokenId: 'reset-uuid-1',
        },
      );
      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'password_reset_completed',
          targetUserId: 'user-uuid-1',
        }),
      );
    });

    it('rejects an unknown token', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue(undefined);

      await expect(
        service.resetPassword('bogus-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsersRepository.changePassword).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue({
        ...makeResetRecord(),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsersRepository.changePassword).not.toHaveBeenCalled();
    });

    it('rejects a token that was already consumed (replay)', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue({
        ...makeResetRecord(),
        consumedAt: new Date(),
      });

      await expect(
        service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles the consume race by rejecting when consumption fails', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue(makeResetRecord());
      mockUsersRepository.changePassword.mockResolvedValue(undefined);

      await expect(
        service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      mockResetTokensRepository.findByHash.mockResolvedValue(makeResetRecord());
      mockUsersRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsersRepository.revokeAllRefreshTokens).not.toHaveBeenCalled();
    });

    it('throws 503 when mail is not enabled', async () => {
      mockMailService.isEnabled.mockReturnValue(false);

      await expect(
        service.resetPassword('raw-password-reset-token', 'new-password-123', '127.0.0.1'),
      ).rejects.toThrow('Password recovery by email is not configured');
    });
  });
});
