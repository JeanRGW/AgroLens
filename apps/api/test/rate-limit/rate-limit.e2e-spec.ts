// Tighten the quotas for this suite only. Assigned at import time so they are
// in place before the testing module validates the environment in beforeAll.
// Originals are restored in afterAll: e2e files share one worker process, so
// a leak would throttle unrelated suites (same supertest IP).
const ORIGINAL_THROTTLE_ENV: Record<string, string | undefined> = {
  THROTTLE_DEFAULT_LIMIT: process.env.THROTTLE_DEFAULT_LIMIT,
  THROTTLE_AUTH_LIMIT: process.env.THROTTLE_AUTH_LIMIT,
};
process.env.THROTTLE_DEFAULT_LIMIT = '5';
process.env.THROTTLE_AUTH_LIMIT = '3';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { cleanDatabase } from '../e2e-helpers';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');

    await app.init();
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
  });

  it('throttles critical auth routes at THROTTLE_AUTH_LIMIT', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(202);
    }
    const throttled = await request(server)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(throttled.status).toBe(429);
    expect(throttled.headers['retry-after-critical']).toBeDefined();
  });

  it('throttles default routes at THROTTLE_DEFAULT_LIMIT', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server).get('/api/auth/me').expect(401);
    }
    const throttled = await request(server).get('/api/auth/me');
    expect(throttled.status).toBe(429);
    expect(throttled.headers['retry-after']).toBeDefined();
  });

  it('never throttles health checks', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server).get('/api/health').expect(200);
    }
  });
});
