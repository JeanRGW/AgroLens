import { Inject, Injectable } from '@nestjs/common';
import { eq, and, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { passwordResetTokens, users } from '../schema';
import type { InferSelectModel } from 'drizzle-orm';

export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>;

@Injectable()
export class PasswordResetTokensRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    passwordHash: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user || user.disabledAt || user.passwordHash !== passwordHash) return false;
      await tx.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
      return true;
    });
  }

  async findByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async deleteExpiredForUser(userId: string, now: Date = new Date()): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), lt(passwordResetTokens.expiresAt, now)));
  }
}
