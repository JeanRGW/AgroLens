import { Inject, Injectable } from '@nestjs/common';
import { eq, and, isNull, or, like, sql, SQL, count, gt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { users, refreshTokens, passwordResetTokens, auditEvents } from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  // ── User queries ─────────────────────────────────────────────────

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async create(data: NewUser): Promise<User> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }

  async update(
    id: string,
    data: Partial<Pick<User, 'fullName' | 'phone' | 'role' | 'disabledAt'>>,
  ): Promise<User | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  async changePassword(
    id: string,
    passwordHash: string,
    authorization: { currentPasswordHash: string } | { resetTokenId: string } | { admin: true },
  ): Promise<User | undefined> {
    return this.db.transaction(async (tx) => {
      // Serialize password changes, token issuance and refresh rotation by user.
      const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!user) return undefined;
      if (!('admin' in authorization) && user.disabledAt) return undefined;
      if (
        'currentPasswordHash' in authorization &&
        user.passwordHash !== authorization.currentPasswordHash
      ) {
        return undefined;
      }

      const now = new Date();
      if ('resetTokenId' in authorization) {
        const [consumed] = await tx
          .update(passwordResetTokens)
          .set({ consumedAt: now })
          .where(
            and(
              eq(passwordResetTokens.id, authorization.resetTokenId),
              eq(passwordResetTokens.userId, id),
              isNull(passwordResetTokens.consumedAt),
              gt(passwordResetTokens.expiresAt, now),
            ),
          )
          .returning({ id: passwordResetTokens.id });
        if (!consumed) return undefined;
      }

      const [updated] = await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, id))
        .returning();
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.consumedAt)));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      return updated;
    });
  }

  /**
   * List users with optional search/role filters and pagination.
   * Returns [users, total] tuple for paginated responses.
   */
  async listFilteredAndCount(options: {
    search?: string;
    role?: string;
    limit: number;
    offset: number;
  }): Promise<[User[], number]> {
    const { search, role, limit, offset } = options;
    const conditions: SQL[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(like(users.email, pattern), like(users.fullName, pattern))!);
    }
    if (role) {
      conditions.push(eq(users.role, role));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(sql`LOWER(${users.email})`)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(users).where(where),
    ]);

    return [rows, countResult[0]?.total ?? 0];
  }

  async search(query: string, limit = 20): Promise<User[]> {
    const pattern = `%${query}%`;
    return this.db
      .select()
      .from(users)
      .where(
        or(
          like(users.email, pattern),
          like(users.fullName, pattern),
          sql`CAST(${users.id} AS TEXT) LIKE ${pattern}`,
        ),
      )
      .orderBy(sql`LOWER(${users.email})`)
      .limit(limit);
  }

  async searchByName(query: string, limit = 20): Promise<{ id: string; fullName: string }[]> {
    const pattern = `%${query}%`;
    return this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(like(users.fullName, pattern))
      .orderBy(sql`LOWER(${users.fullName})`)
      .limit(limit);
  }

  async setRole(
    id: string,
    role: string,
    audit?: { actorUserId: string; before: unknown; after: unknown },
  ): Promise<User | undefined | 'last-admin'> {
    return this.db.transaction(async (tx) => {
      // Serialize last-admin removals: lock the active-admin set (in PK order
      // so concurrent admin mutations cannot deadlock) before deciding.
      // A demotion only needs the guard when it would remove the final
      // active admin; promotions and non-admin targets skip the check below
      // naturally since the target is absent from the locked set.
      if (role !== 'admin') {
        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
          .orderBy(users.id)
          .for('update');
        if (activeAdmins.some((row) => row.id === id) && activeAdmins.length <= 1) {
          return 'last-admin' as const;
        }
      }
      const [row] = await tx
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (row && audit)
        await tx.insert(auditEvents).values({
          eventType: 'role_change',
          actorUserId: audit.actorUserId,
          targetUserId: id,
          before: audit.before,
          after: audit.after,
        });
      return row;
    });
  }

  /**
   * Disable or re-enable a user atomically with session revocation and audit.
   *
   * Sets `disabledAt` (now when disabling, NULL when re-enabling), revokes
   * every active refresh-token session, and inserts a `user_disabled` or
   * `user_enabled` audit event in the same transaction. An audit insert
   * failure aborts the mutation so the state change is never unaudited.
   */
  async setDisabled(
    id: string,
    disabled: boolean,
    audit?: { actorUserId: string; before: unknown; after: unknown },
  ): Promise<User | undefined | 'last-admin'> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      // Serialize last-admin removals (see setRole): disabling only needs the
      // guard when it would remove the final active admin. Re-enabling and
      // non-admin targets skip the check naturally.
      if (disabled) {
        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
          .orderBy(users.id)
          .for('update');
        if (activeAdmins.some((row) => row.id === id) && activeAdmins.length <= 1) {
          return 'last-admin' as const;
        }
      }
      const [row] = await tx
        .update(users)
        .set({ disabledAt: disabled ? now : null, updatedAt: now })
        .where(eq(users.id, id))
        .returning();
      if (!row) return undefined;
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: disabled ? 'user_disabled' : 'user_enabled',
          actorUserId: audit.actorUserId,
          targetUserId: id,
          before: audit.before,
          after: audit.after,
        });
      return row;
    });
  }

  // ── Refresh token queries ────────────────────────────────────────

  async insertRefreshToken(
    data: NewRefreshToken,
    passwordHash: string,
  ): Promise<RefreshToken | undefined> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, data.userId)).for('update');
      if (!user || user.disabledAt || user.passwordHash !== passwordHash) return undefined;
      const [row] = await tx.insert(refreshTokens).values(data).returning();
      return row;
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
      .limit(1);
    return row;
  }

  /**
   * Find a refresh token by hash regardless of revoked status.
   * Used for refresh token reuse detection: if a revoked token is presented,
   * the entire token family must be revoked.
   */
  async findRefreshTokenByHashAny(tokenHash: string): Promise<RefreshToken | undefined> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Match rotation's lock order. The subsequent statement must see any
      // replacement committed while we were waiting for the user lock.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(
          sql`${users.id} IN (SELECT user_id FROM refresh_tokens WHERE family_id = ${familyId})`,
        )
        .for('update');
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    });
  }

  async replaceRefreshToken(
    oldTokenId: string,
    newToken: NewRefreshToken,
  ): Promise<RefreshToken | undefined> {
    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, newToken.userId))
        .for('update');
      const [revoked] = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, oldTokenId), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!revoked) return undefined;

      const [row] = await tx.insert(refreshTokens).values(newToken).returning();

      await tx
        .update(refreshTokens)
        .set({ replacedByTokenId: row.id })
        .where(eq(refreshTokens.id, oldTokenId));

      return row;
    });
  }
}
