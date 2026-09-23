import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('HealthController (e2e)', () => {
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
  });

  it('GET /api/health — should return ok without leaking internals', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res: { body: { status: string; timestamp?: string } }) => {
        expect(res.body.status).toBe('ok');
        expect(typeof res.body.timestamp).toBe('string');
        expect(res.body).not.toHaveProperty('environment');
        expect(res.body).not.toHaveProperty('version');
      });
  });

  it('GET /api/health/config — should expose runtime feature flags only', () => {
    return request(app.getHttpServer())
      .get('/api/health/config')
      .expect(200)
      .expect((res: { body: { inferenceEnabled?: unknown; mailEnabled?: unknown } }) => {
        expect(typeof res.body.inferenceEnabled).toBe('boolean');
        expect(typeof res.body.mailEnabled).toBe('boolean');
        expect(Object.keys(res.body)).toEqual(['inferenceEnabled', 'mailEnabled']);
      });
  });

  it('GET /api/health/db — should require admin auth', () => {
    return request(app.getHttpServer()).get('/api/health/db').expect(401);
  });

  it('GET /api/health/storage — should require admin auth', () => {
    return request(app.getHttpServer()).get('/api/health/storage').expect(401);
  });
});
