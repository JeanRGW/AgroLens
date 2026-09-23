import { PasswordService } from '../../src/auth/password.service';

// Argon2id hashing/verification is CPU+memory intensive and can exceed
// Jest's default 5 s timeout under parallel worker load.
jest.setTimeout(30000);

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should return a non-empty string', async () => {
      const hash = await service.hash('testpassword');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should return an argon2id hash (starts with $argon2id)', async () => {
      const hash = await service.hash('testpassword');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should produce different hashes for the same input (random salt)', async () => {
      const hash1 = await service.hash('testpassword');
      const hash2 = await service.hash('testpassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify', () => {
    // Pre-compute a hash once for verify tests that need a valid hash,
    // reducing redundant Argon2 operations under parallel load.
    let validHash: string;

    beforeAll(async () => {
      // Use a dedicated instance here since beforeEach hasn't run yet.
      validHash = await new PasswordService().hash('correctpassword');
    });

    it('should return true for the correct password', async () => {
      const result = await service.verify(validHash, 'correctpassword');
      expect(result).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const result = await service.verify(validHash, 'wrongpassword');
      expect(result).toBe(false);
    });

    it('should return false for a malformed hash', async () => {
      const result = await service.verify('not-a-valid-hash', 'password');
      expect(result).toBe(false);
    });

    it('should return false for an empty hash', async () => {
      const result = await service.verify('', 'password');
      expect(result).toBe(false);
    });
  });
});
