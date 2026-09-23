// Raise the critical-auth quota for this suite only. Assigned at import time
// so it is in place before the testing module validates the environment in
// beforeAll. The expanded suite issues >10 critical-auth requests from the
// same supertest IP within 60s (default THROTTLE_AUTH_LIMIT=10), which would
// otherwise 429 the later tests. Originals are restored in afterAll: e2e
// files share one worker process, so a leak would throttle unrelated suites.
const ORIGINAL_THROTTLE_ENV: Record<string, string | undefined> = {
  THROTTLE_AUTH_LIMIT: process.env.THROTTLE_AUTH_LIMIT,
};
process.env.THROTTLE_AUTH_LIMIT = '100';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { cleanDatabase, promoteToAdmin } from '../e2e-helpers';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../src/database/database.constants';
import { passwordResetTokens, refreshTokens } from '../../src/database/schema';
import { UsersRepository, PasswordResetTokensRepository } from '../../src/database/repositories';
import { eq, sql } from 'drizzle-orm';

// The e2e suite runs with the in-memory test transport configured by
// setup-env.ts (MAIL_TRANSPORT=test captures sent messages on MailService).
describe('Password recovery (e2e)', () => {
  let app: INestApplication;
  let mailService: MailService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');

    await app.init();
    mailService = app.get(MailService);
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    for (const [key, value] of Object.entries(ORIGINAL_THROTTLE_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    mailService.clearTestMessages();
  });

  it('POST /api/auth/forgot-password answers 202 for unknown emails', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(202);

    expect(mailService.getTestMessages()).toHaveLength(0);
  });

  it('emails a single-use reset link and resets the password end-to-end', async () => {
    // Register a user directly through the API (registration is enabled in e2e).
    const register = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'reset-me@example.com',
      password: 'old-password-123',
      fullName: 'Reset Me',
      clientType: 'web',
    });
    expect(register.status).toBe(201);

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'reset-me@example.com' })
      .expect(202);

    const sent = mailService.getTestMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('reset-me@example.com');

    const token = sent[0].text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brand-new-password-456' })
      .expect(200);

    // The new password works for login...
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'reset-me@example.com',
        password: 'brand-new-password-456',
        clientType: 'web',
      })
      .expect(200);

    // ...and the old one no longer does.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'reset-me@example.com',
        password: 'old-password-123',
        clientType: 'web',
      })
      .expect(401);
  });

  it('rejects reusing the same reset token (single-use)', async () => {
    const register = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'once-only@example.com',
      password: 'old-password-123',
      fullName: 'Once Only',
      clientType: 'web',
    });
    expect(register.status).toBe(201);

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'once-only@example.com' })
      .expect(202);

    const token = mailService.getTestMessages()[0].text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    const first = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'first-password-123' });
    expect(first.status).toBe(200);

    const replay = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'second-password-456' });
    expect(replay.status).toBe(400);
  });

  it('rejects a garbage token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'brand-new-password-456' })
      .expect(400);
  });

  async function registerWithRecoveryLinks() {
    const email = 'credential-test@example.com';
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password: 'old-password-123',
        fullName: 'Credential Test',
        clientType: 'mobile',
      })
      .expect(201);
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(202);
    }
    const tokens = mailService.getTestMessages().map((message) => {
      const token = message.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
      if (!token) throw new Error('Missing recovery token');
      return token;
    });
    return {
      email,
      tokens,
      userId: response.body.user.id as string,
      accessToken: response.body.accessToken as string,
      refreshToken: response.body.refreshToken as string,
    };
  }

  it.each(['recovery', 'authenticated', 'admin'] as const)(
    '%s password changes invalidate every old recovery link and refresh session',
    async (mode) => {
      const user = await registerWithRecoveryLinks();
      const newPassword = 'new-password-456';
      if (mode === 'recovery') {
        await request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send({ token: user.tokens[0], newPassword })
          .expect(200);
      } else if (mode === 'authenticated') {
        await request(app.getHttpServer())
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ currentPassword: 'old-password-123', newPassword })
          .expect(200);
      } else {
        await promoteToAdmin(app, user.userId);
        await request(app.getHttpServer())
          .post(`/api/admin/users/${user.userId}/reset-password`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ newPassword })
          .expect(200);
      }

      for (const token of user.tokens) {
        await request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send({ token, newPassword: 'attacker-password-789' })
          .expect(400);
      }
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: user.refreshToken, clientType: 'mobile' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: newPassword, clientType: 'mobile' })
        .expect(200);
    },
  );

  it('allows only one of two concurrent recovery links to change the password', async () => {
    const user = await registerWithRecoveryLinks();
    const responses = await Promise.all(
      user.tokens.map((token, index) =>
        request(app.getHttpServer())
          .post('/api/auth/reset-password')
          .send({ token, newPassword: `concurrent-password-${index}` }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  });

  it('rolls back token consumption and the password if session revocation fails', async () => {
    const user = await registerWithRecoveryLinks();
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const repository = app.get(UsersRepository);
    const before = await repository.findById(user.userId);
    const [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.userId));
    await db.execute(sql`CREATE FUNCTION test_fail_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test revocation failure'; END;
    $$`);
    try {
      await db.execute(sql`CREATE TRIGGER test_fail_revocation BEFORE UPDATE ON refresh_tokens
        FOR EACH ROW EXECUTE FUNCTION test_fail_revocation()`);
      await expect(
        repository.changePassword(user.userId, 'must-not-be-stored', { resetTokenId: record.id }),
      ).rejects.toThrow();
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS test_fail_revocation ON refresh_tokens`);
      await db.execute(sql`DROP FUNCTION test_fail_revocation()`);
    }
    expect((await repository.findById(user.userId))!.passwordHash).toBe(before!.passwordHash);
    const links = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.userId));
    expect(links.every((link) => link.consumedAt === null)).toBe(true);
    const sessions = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, user.userId));
    expect(sessions.every((session) => session.revokedAt === null)).toBe(true);
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: user.tokens[0], newPassword: 'retry-password-456' })
      .expect(200);
  });

  it('rejects stale password verification and token issuance after a password change', async () => {
    const user = await registerWithRecoveryLinks();
    const repository = app.get(UsersRepository);
    const before = (await repository.findById(user.userId))!;
    await repository.changePassword(user.userId, 'new-hash', { admin: true });
    await expect(
      repository.changePassword(user.userId, 'stale-hash', {
        currentPasswordHash: before.passwordHash,
      }),
    ).resolves.toBeUndefined();
    await expect(
      app
        .get(PasswordResetTokensRepository)
        .create(user.userId, 'stale-reset-hash', new Date(Date.now() + 60000), before.passwordHash),
    ).resolves.toBe(false);
    await expect(
      repository.insertRefreshToken(
        {
          userId: user.userId,
          familyId: user.userId,
          tokenHash: 'stale-refresh-hash',
          expiresAt: new Date(Date.now() + 60000),
        },
        before.passwordHash,
      ),
    ).resolves.toBeUndefined();
  });
});
