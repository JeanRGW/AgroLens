// Raise the auth bucket for this suite only: each test registers and logs in
// two admins. Assigned at import time so the value is in place before the
// testing module validates the environment. Restored in afterAll: e2e files
// share one worker process.
const ORIGINAL_AUTH_LIMIT = process.env.THROTTLE_AUTH_LIMIT;
process.env.THROTTLE_AUTH_LIMIT = '100';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { and, count, eq, isNull } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../src/database/database.constants';
import { users } from '../../src/database/schema';
import {
  cleanDatabase,
  createTestApp,
  loginUser,
  promoteToAdmin,
  registerUser,
} from '../e2e-helpers';

describe('Last-admin safety under concurrency (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (ORIGINAL_AUTH_LIMIT === undefined) {
      delete process.env.THROTTLE_AUTH_LIMIT;
    } else {
      process.env.THROTTLE_AUTH_LIMIT = ORIGINAL_AUTH_LIMIT;
    }
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  async function setupTwoAdmins(tag: string) {
    const adminA = await registerUser(
      app,
      `e2e-race-a-${tag}@test.local`,
      'TestPass123!',
      'Race A',
    );
    const adminB = await registerUser(
      app,
      `e2e-race-b-${tag}@test.local`,
      'TestPass123!',
      'Race B',
    );
    await promoteToAdmin(app, adminA.userId);
    await promoteToAdmin(app, adminB.userId);
    const tokensA = await loginUser(app, adminA.email, adminA.password);
    const tokensB = await loginUser(app, adminB.email, adminB.password);
    return { adminA, adminB, tokensA, tokensB };
  }

  async function activeAdminCount(): Promise<number> {
    const db: DatabaseConnection = app.get(DATABASE_CONNECTION);
    const [row] = await db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)));
    return row?.total ?? 0;
  }

  it('lets exactly one of two concurrent disables of the last admins succeed', async () => {
    const { adminA, adminB, tokensA, tokensB } = await setupTwoAdmins(`disable-${Date.now()}`);
    const server = app.getHttpServer();

    const [resA, resB] = await Promise.all([
      request(server)
        .patch(`/api/admin/users/${adminB.userId}/disabled`)
        .set('Authorization', `Bearer ${tokensA.accessToken}`)
        .send({ disabled: true }),
      request(server)
        .patch(`/api/admin/users/${adminA.userId}/disabled`)
        .set('Authorization', `Bearer ${tokensB.accessToken}`)
        .send({ disabled: true }),
    ]);

    // Exactly one disable wins. The loser is rejected either by the locked
    // guard (403, request reached the service before the winner committed)
    // or by the auth guard (401, their account was already suspended
    // mid-flight) — both are correct denials.
    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0]).toBe(200);
    expect([401, 403]).toContain(statuses[1]);
    const winner = resA.status === 200 ? resA : resB;
    expect((winner.body as { user: { disabledAt: string | null } }).user.disabledAt).not.toBeNull();
    expect(await activeAdminCount()).toBe(1);
  });

  it('lets exactly one of two concurrent demotes of the last admins succeed', async () => {
    const { adminA, adminB, tokensA, tokensB } = await setupTwoAdmins(`demote-${Date.now()}`);
    const server = app.getHttpServer();

    const [resA, resB] = await Promise.all([
      request(server)
        .patch(`/api/admin/users/${adminB.userId}/role`)
        .set('Authorization', `Bearer ${tokensA.accessToken}`)
        .send({ role: 'user' }),
      request(server)
        .patch(`/api/admin/users/${adminA.userId}/role`)
        .set('Authorization', `Bearer ${tokensB.accessToken}`)
        .send({ role: 'user' }),
    ]);

    expect([resA.status, resB.status].sort()).toEqual([200, 403]);
    expect(await activeAdminCount()).toBe(1);
  });
});
