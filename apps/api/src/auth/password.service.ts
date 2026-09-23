import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Reusable Argon2id password hashing service.
 * Used by auth registration/login and the first-admin seed script (via direct argon2 usage).
 */
@Injectable()
export class PasswordService {
  /**
   * Hash a plaintext password using Argon2id.
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verify a plaintext password against an Argon2id hash.
   * Returns false if the hash is malformed or verification fails.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Malformed hash or other argon2 internal error
      return false;
    }
  }
}
