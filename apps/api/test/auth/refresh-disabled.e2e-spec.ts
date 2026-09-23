// Raise the auth bucket for this suite only: suspension flows need several
// register/login/refresh calls in one 60s window. Assigned at import time so
// the value is in place before the testing module validates the environment.
// Restored in afterAll: e2e files share one worker process.
const ORIGINAL_AUTH_ENV: Record<string, string | undefined> = {
  THROTTLE_AUTH_LIMIT: process.env.THROTTLE_AUTH_LIMIT,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
};
process.env.THROTTLE_AUTH_LIMIT = '100';
process.env.CORS_ORIGINS = 'http://localhost:4200';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  cleanDatabase,
  createTestApp,
  loginUser,
  promoteToAdmin,
  registerUser,
} from '../e2e-helpers';

const DISABLED_CODE = 'account_disabled';

describe('Suspended sessions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    for (const [key, value] of Object.entries(ORIGINAL_AUTH_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  async function setupSuspendedStudent(tag: string) {
    const admin = await registerUser(
      app,
      `e2e-suspend-admin-${tag}@test.local`,
      'TestPass123!',
      'Suspend Admin',
    );
    const student = await registerUser(
      app,
      `e2e-suspend-student-${tag}@test.local`,
      'TestPass123!',
      'Suspend Student',
    );
    await promoteToAdmin(app, admin.userId);
    const adminTokens = await loginUser(app, admin.email, admin.password);
    const studentTokens = await loginUser(app, student.email, student.password);

    // Sanity: the session works before suspension.
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(200);

    const disabled = await request(app.getHttpServer())
      .patch(`/api/admin/users/${student.userId}/disabled`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ disabled: true })
      .expect(200);
    expect(
      (disabled.body as { user: { disabledAt: string | null } }).user.disabledAt,
    ).not.toBeNull();

    return { admin, student, studentTokens };
  }

  it('returns the disabled code on the first refresh after suspension', async () => {
    const { studentTokens } = await setupSuspendedStudent(`first-${Date.now()}`);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: studentTokens.refreshToken, clientType: 'mobile' })
      .expect(401);

    expect(res.body).toMatchObject({
      code: DISABLED_CODE,
      statusCode: 401,
      message: 'User account is disabled',
    });
  });

  it('keeps the disabled code on repeat refresh after the token is revoked', async () => {
    const { studentTokens } = await setupSuspendedStudent(`repeat-${Date.now()}`);

    // First attempt revokes the presented token; the retry lands in the
    // reuse-detection branch and must still report the disabled code.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: studentTokens.refreshToken, clientType: 'mobile' })
      .expect(401);

    const retry = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: studentTokens.refreshToken, clientType: 'mobile' })
      .expect(401);

    expect(retry.body).toMatchObject({
      code: DISABLED_CODE,
      statusCode: 401,
    });
  });

  it('prefers the disabled error when a stale cookie fails first', async () => {
    const { studentTokens } = await setupSuspendedStudent(`cookie-${Date.now()}`);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `refresh_token=bogus-stale-token; refresh_token=${studentTokens.refreshToken}`)
      .send({ clientType: 'web' })
      .expect(401);

    expect(res.body).toMatchObject({
      code: DISABLED_CODE,
      statusCode: 401,
    });
  });

  it('reports the code on login and guard checks for suspended accounts', async () => {
    const { student, studentTokens } = await setupSuspendedStudent(`login-${Date.now()}`);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email, password: student.password, clientType: 'mobile' })
      .expect(401);
    expect(login.body).toMatchObject({
      code: DISABLED_CODE,
      statusCode: 401,
    });

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${studentTokens.accessToken}`)
      .expect(401);
    expect(me.body).toMatchObject({
      code: DISABLED_CODE,
      statusCode: 401,
    });
  });
});
