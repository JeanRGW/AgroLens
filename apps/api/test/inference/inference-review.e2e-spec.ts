import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { InferenceEnabledGuard } from '../../src/inference/inference-enabled.guard';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../src/database/database.constants';
import { inferenceModels, inferenceJobs, inferenceJobImages } from '../../src/database/schema';
import { registerUser, type TestUser } from '../e2e-helpers';

describe('saved inference reviews (real PostgreSQL)', () => {
  let app: INestApplication;
  let owner: TestUser, other: TestUser;
  const jobId = randomUUID(),
    imageId = randomUUID();
  const original = {
    classId: 0,
    className: 'corn',
    confidence: 0.9,
    xCenter: 0.5,
    yCenter: 0.5,
    width: 0.2,
    height: 0.2,
  };
  const endpoint = `/api/inference/jobs/${jobId}/images/${imageId}`;
  beforeAll(async () => {
    // No model execution is needed; use persisted, completed output and keep real auth/validation.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(InferenceEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    owner = await registerUser(
      app,
      `review-owner-${randomUUID()}@test.local`,
      randomUUID(),
      'Review owner',
    );
    other = await registerUser(
      app,
      `review-other-${randomUUID()}@test.local`,
      randomUUID(),
      'Other user',
    );
    const db: DatabaseConnection = app.get(DATABASE_CONNECTION);
    const classes = [{ id: 0, name: 'corn' }];
    const [model] = await db
      .insert(inferenceModels)
      .values({
        name: `review-${randomUUID()}`,
        objectKey: 'test/review-model.pt',
        sizeBytes: 1,
        status: 'ready',
        active: true,
        classes,
        createdByUserId: owner.userId,
      })
      .returning();
    await db
      .insert(inferenceJobs)
      .values({
        id: jobId,
        userId: owner.userId,
        modelId: model.id,
        modelSnapshot: { id: model.id, name: model.name, task: 'detect', classes },
        sourceType: 'temporary',
        status: 'completed',
        imageCount: 1,
        completedCount: 1,
        expiresAt: new Date(Date.now() + 3600000),
      });
    await db
      .insert(inferenceJobImages)
      .values({
        id: imageId,
        jobId,
        imageIndex: 0,
        fileName: 'corn.jpg',
        sourceObjectKey: 'test/corn.jpg',
        status: 'completed',
        width: 1000,
        height: 1000,
        detections: [original],
      });
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  async function getResult() {
    const response = await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    return response.body;
  }
  it('persists removal of every box, preserves original output and restores it', async () => {
    const initial = await getResult();
    expect(initial.reviewedDetections).toBeNull();
    await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ expectedUpdatedAt: initial.updatedAt, detections: [] })
      .expect(403);
    const saved = await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ expectedUpdatedAt: initial.updatedAt, detections: [] })
      .expect(200);
    const reviewed = await getResult();
    expect(reviewed.detections).toEqual([original]);
    expect(reviewed.reviewedDetections).toEqual([]);
    await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        expectedUpdatedAt: initial.updatedAt,
        detections: [{ ...original, confidence: null }],
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ expectedUpdatedAt: saved.body.updatedAt, detections: null })
      .expect(200);
    expect((await getResult()).reviewedDetections).toBeNull();
  });
  it('rejects invalid geometry and invented scores', async () => {
    const { updatedAt } = await getResult();
    for (const box of [
      { ...original, width: 0 },
      { ...original, xCenter: 0.7 },
      { ...original, className: 'weed', confidence: null },
    ]) {
      await request(app.getHttpServer())
        .post(`${endpoint}/review`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ expectedUpdatedAt: updatedAt, detections: [box] })
        .expect(400);
    }
  });
  it('allows only one of two concurrent saves with the same revision', async () => {
    const { updatedAt } = await getResult();
    const responses = await Promise.all(
      [0.4, 0.6].map((xCenter) =>
        request(app.getHttpServer())
          .post(`${endpoint}/review`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({
            expectedUpdatedAt: updatedAt,
            detections: [{ ...original, xCenter, confidence: null }],
          }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getResult()).detections).toEqual([original]);
  });
});
