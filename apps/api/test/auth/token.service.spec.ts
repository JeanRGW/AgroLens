import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../src/auth/token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;

  const testSecret = 'test-jwt-secret-key-for-unit-tests-at-least-32';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 30;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);

    // Set the secret on JwtService for signing/verifying
    jwtService = new JwtService({ secret: testSecret });
    // Re-create TokenService with the configured JwtService
    service = new TokenService(jwtService, {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 30;
        return defaultValue;
      },
    } as unknown as ConfigService);
  });

  describe('generateAccessToken', () => {
    it('should return a JWT string', () => {
      const token = service.generateAccessToken({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include sub, email, and role in the payload', () => {
      const token = service.generateAccessToken({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      });
      const payload = service.verifyAccessToken(token);
      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.role).toBe('admin');
    });
  });

  describe('verifyAccessToken', () => {
    it('should return the correct payload for a valid token', () => {
      const token = service.generateAccessToken({
        id: 'user-456',
        email: 'other@example.com',
        role: 'user',
      });
      const payload = service.verifyAccessToken(token);
      expect(payload.sub).toBe('user-456');
      expect(payload.email).toBe('other@example.com');
      expect(payload.role).toBe('user');
    });

    it('should throw for an invalid token string', () => {
      expect(() => service.verifyAccessToken('not.a.jwt')).toThrow();
    });

    it('should throw for a token signed with a different secret', () => {
      const otherService = new TokenService(
        new JwtService({ secret: 'different-secret-key-32-chars-long!!!' }),
        { get: () => 30 } as unknown as ConfigService,
      );
      const token = otherService.generateAccessToken({
        id: 'user-1',
        email: 'a@b.com',
        role: 'user',
      });
      expect(() => service.verifyAccessToken(token)).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should return a raw token and its hash', () => {
      const result = service.generateRefreshToken();
      expect(result.rawToken).toBeDefined();
      expect(result.tokenHash).toBeDefined();
      expect(typeof result.rawToken).toBe('string');
      expect(typeof result.tokenHash).toBe('string');
    });

    it('should return an 80-character hex raw token (40 random bytes)', () => {
      const result = service.generateRefreshToken();
      expect(result.rawToken).toHaveLength(80);
      expect(result.rawToken).toMatch(/^[0-9a-f]{80}$/);
    });

    it('should return a 64-character hex hash (SHA-256)', () => {
      const result = service.generateRefreshToken();
      expect(result.tokenHash).toHaveLength(64);
      expect(result.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different tokens each time', () => {
      const t1 = service.generateRefreshToken();
      const t2 = service.generateRefreshToken();
      expect(t1.rawToken).not.toBe(t2.rawToken);
      expect(t1.tokenHash).not.toBe(t2.tokenHash);
    });
  });

  describe('hashToken', () => {
    it('should produce a consistent SHA-256 hash', () => {
      const hash1 = service.hashToken('test-token-value');
      const hash2 = service.hashToken('test-token-value');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hashToken('token-a');
      const hash2 = service.hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a 64-character hex string', () => {
      const hash = service.hashToken('any-value');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should match the hash from generateRefreshToken', () => {
      const { rawToken, tokenHash } = service.generateRefreshToken();
      const computedHash = service.hashToken(rawToken);
      expect(computedHash).toBe(tokenHash);
    });
  });

  describe('getRefreshExpiresAt', () => {
    it('should return a Date in the future', () => {
      const expiresAt = service.getRefreshExpiresAt();
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should be approximately 30 days in the future (default)', () => {
      const now = Date.now();
      const expiresAt = service.getRefreshExpiresAt();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = expiresAt.getTime() - now;
      // Allow 5 second tolerance
      expect(diff).toBeGreaterThanOrEqual(thirtyDaysMs - 5000);
      expect(diff).toBeLessThanOrEqual(thirtyDaysMs + 5000);
    });
  });
});
