import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';
import { TokenService } from '../../src/auth/token.service';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../src/database/database.constants';
import { isUniqueViolation } from '../../src/database/database.utils';
import {
  AccessRepository,
  CatalogRepository,
  InferenceRepository,
  JobsRepository,
  UploadsRepository,
  type User,
} from '../../src/database/repositories';
import * as schema from '../../src/database/schema';
import { InferenceService } from '../../src/worker/inference.service';
import { cleanDatabase, createTestApp } from '../e2e-helpers';

// Run against a migrated, disposable database with WORKER_ENABLED=false.
describe('Database integrity (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseConnection;
  let inference: InferenceRepository;
  let owner: User;
  let other: User;
  let admin: User;
  let ownerAuth: string;
  let adminAuth: string;

  beforeAll(async () => {
    app = await createTestApp();
    app.useLogger(false);
    app.get(ConfigService).set('INFERENCE_ENABLED', true);
    db = app.get(DATABASE_CONNECTION);
    inference = app.get(InferenceRepository);
  }, 30_000);

  beforeEach(async () => {
    await cleanDatabase(app);
    [owner, other, admin] = await db
      .insert(schema.users)
      .values([
        { email: 'owner@example.com', fullName: 'Owner', passwordHash: 'unused' },
        { email: 'other@example.com', fullName: 'Other', passwordHash: 'unused' },
        { email: 'admin@example.com', fullName: 'Admin', passwordHash: 'unused', role: 'admin' },
      ])
      .returning();
    const tokens = app.get(TokenService);
    ownerAuth = `Bearer ${tokens.generateAccessToken(owner)}`;
    adminAuth = `Bearer ${tokens.generateAccessToken(admin)}`;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function modelFixture(overrides: Partial<typeof schema.inferenceModels.$inferInsert> = {}) {
    return inference.createModel({
      name: randomUUID(),
      version: '1',
      objectKey: `models/${randomUUID()}/best.pt`,
      sizeBytes: 1,
      createdByUserId: admin.id,
      status: 'ready',
      ...overrides,
    });
  }

  async function jobFixture(overrides: Partial<typeof schema.inferenceJobs.$inferInsert> = {}) {
    const model = await modelFixture({ active: true });
    const id = randomUUID();
    const keys = [`inference-temp/${id}/0.jpg`, `inference-temp/${id}/1.jpg`];
    const job = await inference.createJobWithImages(
      {
        id,
        userId: owner.id,
        modelId: model.id,
        modelSnapshot: { id: model.id },
        sourceType: 'temporary',
        status: 'completed',
        imageCount: 2,
        ...overrides,
      },
      keys.map((sourceObjectKey, imageIndex) => ({
        jobId: id,
        sourceObjectKey,
        imageIndex,
        fileName: `${imageIndex}.jpg`,
      })),
    );
    return { job, keys };
  }

  async function rejectCleanupInserts(action: () => Promise<void>) {
    await db.execute(sql`
      ALTER TABLE object_deletion_jobs ADD CONSTRAINT reject_cleanup_test CHECK (false) NOT VALID
    `);
    try {
      await action();
    } finally {
      await db.execute(sql`ALTER TABLE object_deletion_jobs DROP CONSTRAINT reject_cleanup_test`);
    }
  }

  it('deletes temporary jobs and images with durable cleanup and audit records', async () => {
    const { job, keys } = await jobFixture();
    await request(app.getHttpServer())
      .delete(`/api/inference/jobs/${job.id}`)
      .set('Authorization', ownerAuth)
      .expect(200, { deleted: true });

    expect(await inference.findJobById(job.id)).toBeUndefined();
    expect(await inference.listImagesByJobId(job.id)).toEqual([]);
    expect(await inference.deleteJob(job.id)).toBeUndefined();
    const cleanup = await db.select().from(schema.objectDeletionJobs);
    expect(cleanup.map((row) => row.objectKey).sort()).toEqual(keys.sort());
    expect(cleanup.every((row) => row.status === 'pending' && row.uploadId === null)).toBe(true);
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, job.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: 'job_delete',
      metadata: { sourceType: 'temporary', keyCount: 2 },
    });
  });

  it('rolls back job/image deletion and its audit when cleanup cannot be enqueued', async () => {
    const { job } = await jobFixture();
    await rejectCleanupInserts(async () => {
      await request(app.getHttpServer())
        .delete(`/api/inference/jobs/${job.id}`)
        .set('Authorization', ownerAuth)
        .expect(500);
    });
    expect(await inference.findJobById(job.id)).toBeDefined();
    expect(await inference.listImagesByJobId(job.id)).toHaveLength(2);
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual([]);
    expect(await db.select().from(schema.auditEvents)).toEqual([]);
  });

  it('soft-deletes a model and queues its object exactly once', async () => {
    const model = await modelFixture();
    await request(app.getHttpServer())
      .delete(`/api/admin/inference-models/${model.id}`)
      .set('Authorization', adminAuth)
      .expect(200);
    expect(await inference.findModelById(model.id)).toBeUndefined();
    expect(await inference.softDeleteModel(model.id)).toBeUndefined();
    const cleanup = await db.select().from(schema.objectDeletionJobs);
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0]).toMatchObject({
      objectKey: model.objectKey,
      status: 'pending',
      uploadId: null,
    });
    const audit = await db.select().from(schema.auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ eventType: 'model_delete', resourceId: model.id });
  });

  it('rolls back model deletion and its audit when cleanup cannot be enqueued', async () => {
    const model = await modelFixture();
    await rejectCleanupInserts(async () => {
      await request(app.getHttpServer())
        .delete(`/api/admin/inference-models/${model.id}`)
        .set('Authorization', adminAuth)
        .expect(500);
    });
    expect(await inference.findModelById(model.id)).toMatchObject({ deletedAt: null });
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual([]);
    expect(await db.select().from(schema.auditEvents)).toEqual([]);
  });

  it('keeps failed automatic cleanup discoverable and retries expired jobs and abandoned models', async () => {
    const { job, keys } = await jobFixture({ expiresAt: new Date(Date.now() - 60_000) });
    const model = await modelFixture({
      status: 'uploading',
      createdAt: new Date(Date.now() - 48 * 3600_000),
    });
    const worker = app.get(InferenceService);
    await rejectCleanupInserts(async () => {
      expect(await worker.processExpiredJobs()).toBe(false);
    });
    expect(await inference.findExpiredJobs()).toEqual([expect.objectContaining({ id: job.id })]);
    expect(await inference.findAbandonedModelUploads()).toEqual([
      expect.objectContaining({ id: model.id }),
    ]);
    expect(await inference.listImagesByJobId(job.id)).toHaveLength(2);
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual([]);

    expect(await worker.processExpiredJobs()).toBe(true);
    expect(await worker.processExpiredJobs()).toBe(false);
    expect(await inference.findJobById(job.id)).toBeUndefined();
    expect(await inference.findModelById(model.id)).toBeUndefined();
    const cleanup = await db.select().from(schema.objectDeletionJobs);
    expect(cleanup.map((row) => row.objectKey).sort()).toEqual([...keys, model.objectKey].sort());
  });

  it('preserves upload-owned objects and rejects deletion of active inference jobs', async () => {
    const { job } = await jobFixture({ sourceType: 'upload' });
    await request(app.getHttpServer())
      .delete(`/api/inference/jobs/${job.id}`)
      .set('Authorization', ownerAuth)
      .expect(200);
    const { job: active } = await jobFixture({ status: 'running' });
    await request(app.getHttpServer())
      .delete(`/api/inference/jobs/${active.id}`)
      .set('Authorization', ownerAuth)
      .expect(409);
    expect(await inference.deleteJob(active.id)).toBeUndefined();
    expect(await inference.listImagesByJobId(active.id)).toHaveLength(2);
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual([]);
  });

  async function catalogFixture() {
    const [property] = await db
      .insert(schema.properties)
      .values({
        userId: owner.id,
        name: 'Property',
        normalizedName: 'property',
        owner: 'Owner',
        address: 'Address',
        latitude: 0,
        longitude: 0,
      })
      .returning();
    const [talhao] = await db
      .insert(schema.talhoes)
      .values({
        userId: owner.id,
        propertyId: property.id,
        name: 'Plot',
        normalizedName: 'plot',
      })
      .returning();
    const [crop] = await db
      .insert(schema.cropTypes)
      .values({
        userId: owner.id,
        name: 'Crop',
        normalizedName: 'crop',
      })
      .returning();
    return { property, talhao, crop };
  }

  async function uploadFixture() {
    const { talhao, crop } = await catalogFixture();
    const [upload] = await db
      .insert(schema.uploads)
      .values({
        userId: owner.id,
        talhaoId: talhao.id,
        cropTypeId: crop.id,
        clientUploadId: randomUUID(),
        source: 'phone',
        status: 'failed',
        activityDate: new Date(),
      })
      .returning();
    return upload;
  }

  it('requires both image coordinates or neither, while accepting a real (0, 0) point', async () => {
    const upload = await uploadFixture();
    await expect(
      db.insert(schema.uploadImages).values({
        uploadId: upload.id,
        latitude: -22.9,
        longitude: null,
      }),
    ).rejects.toThrow();
    await db.insert(schema.uploadImages).values({
      uploadId: upload.id,
      latitude: null,
      longitude: null,
    });
    await db.insert(schema.uploadImages).values({
      uploadId: upload.id,
      latitude: 0,
      longitude: 0,
    });
  });

  it('filters and paginates grants on live owned resources across all five resource types', async () => {
    const upload = await uploadFixture();
    const [talhao] = await db
      .select()
      .from(schema.talhoes)
      .where(eq(schema.talhoes.id, upload.talhaoId));
    const [estadio] = await db
      .insert(schema.estadios)
      .values({
        userId: owner.id,
        cropTypeId: upload.cropTypeId,
        name: 'Stage',
        normalizedName: 'stage',
      })
      .returning();
    const extraProperties = await db
      .insert(schema.properties)
      .values([
        {
          userId: other.id,
          name: 'Other',
          normalizedName: 'other',
          owner: 'Other',
          address: 'A',
          latitude: 0,
          longitude: 0,
        },
        {
          userId: owner.id,
          name: 'Deleted',
          normalizedName: 'deleted',
          owner: 'Owner',
          address: 'A',
          latitude: 0,
          longitude: 0,
          deletedAt: new Date(),
        },
      ])
      .returning();
    const resources = [
      { resourceType: 'upload', resourceId: upload.id },
      { resourceType: 'property', resourceId: talhao.propertyId },
      { resourceType: 'talhao', resourceId: upload.talhaoId },
      { resourceType: 'crop_type', resourceId: upload.cropTypeId },
      { resourceType: 'estadio', resourceId: estadio.id },
    ];
    const grantedAt = new Date('2026-01-01');
    await db.insert(schema.accessGrants).values(
      [
        ...resources,
        ...extraProperties.map((p) => ({ resourceType: 'property', resourceId: p.id })),
        { resourceType: 'upload', resourceId: upload.id, revokedAt: new Date() },
      ].map((resource) => ({
        ...resource,
        subjectUserId: other.id,
        grantedByUserId: owner.id,
        grantedAt,
      })),
    );

    const list = (authorization: string, query: Record<string, string | number> = {}) =>
      request(app.getHttpServer())
        .get('/api/access-grants')
        .set('Authorization', authorization)
        .query(query)
        .expect(200);
    const first = await list(ownerAuth, { pageSize: 3, page: 1 });
    const second = await list(ownerAuth, { pageSize: 3, page: 2 });
    expect(first.body.total).toBe(5);
    expect(second.body.total).toBe(5);
    const all = [...first.body.items, ...second.body.items] as Array<{
      id: string;
      resourceId: string;
    }>;
    expect(all.map((g) => g.resourceId).sort()).toEqual(resources.map((r) => r.resourceId).sort());
    expect(all.map((g) => g.id)).toEqual(all.map((g) => g.id).sort());
    for (const resource of resources) {
      const result = await list(ownerAuth, { ...resource, subjectUserId: other.id });
      expect(result.body.total).toBe(1);
      expect(result.body.items).toHaveLength(1);
    }
    expect((await list(ownerAuth, { subjectUserId: admin.id })).body.total).toBe(0);
    expect((await list(ownerAuth, { resourceId: extraProperties[0].id })).body.total).toBe(0);
    expect((await list(adminAuth)).body.total).toBe(8);
  });

  it('selects the lowest preview image ID per upload and batches only originals', async () => {
    const first = await uploadFixture();
    const [second] = await db
      .insert(schema.uploads)
      .values({
        ...first,
        id: randomUUID(),
        clientUploadId: randomUUID(),
      })
      .returning();
    const expectedPreviewIds = new Map<string, string>();
    const imageIdsByUpload = new Map<string, string[]>();
    for (const upload of [first, second]) {
      const orderedIds = Array.from({ length: 4 }, () => randomUUID()).sort();
      expectedPreviewIds.set(upload.id, orderedIds[0]);
      imageIdsByUpload.set(upload.id, orderedIds);
      const images = await db
        .insert(schema.uploadImages)
        .values(
          [orderedIds[2], orderedIds[0], orderedIds[1], orderedIds[3]].map((id) => ({
            uploadId: upload.id,
            id,
            latitude: null,
            longitude: null,
          })),
        )
        .returning();
      await db.insert(schema.uploadFiles).values([
        ...images.slice(0, 3).map((image) => ({
          imageId: image.id,
          variant: 'preview' as const,
          objectKey: `${upload.id}/${image.id}.jpg`,
          contentType: 'image/jpeg',
        })),
        {
          imageId: images[3].id,
          variant: 'original' as const,
          objectKey: `${upload.id}/original.jpg`,
          contentType: 'image/jpeg',
        },
      ]);
    }
    const repository = app.get(UploadsRepository);
    const ids = [first.id, second.id, randomUUID()];
    const previews = await repository.findFirstPreviewByUploadIds(ids);
    expect(previews.size).toBe(2);
    expect(
      [...previews.values()].every(
        (file) => file.imageId === expectedPreviewIds.get(file.uploadId),
      ),
    ).toBe(true);
    const originals = await repository.findOriginalsByUploadIds(ids);
    expect(originals).toHaveLength(2);
    expect(originals.every((file) => file.variant === 'original')).toBe(true);
    expect((await repository.findFilesByUploadId(first.id)).map((file) => file.imageId)).toEqual(
      imageIdsByUpload.get(first.id),
    );
    expect(await repository.findFirstPreviewByUploadIds([])).toEqual(new Map());
    expect(await repository.findOriginalsByUploadIds([])).toEqual([]);
  });

  it('derives property access, filters and deletion from the current talhao parent', async () => {
    const { property, talhao, crop } = await catalogFixture();
    const [destination] = await db
      .insert(schema.properties)
      .values({ ...property, id: randomUUID(), name: 'Destination', normalizedName: 'destination' })
      .returning();
    const uploads = app.get(UploadsRepository);
    const catalog = app.get(CatalogRepository);
    const upload = await uploads.create({
      userId: owner.id,
      talhaoId: talhao.id,
      cropTypeId: crop.id,
      clientUploadId: randomUUID(),
      source: 'phone',
      status: 'ready',
      activityDate: new Date(),
    });
    expect(upload.propertyId).toBe(property.id);
    const [image] = await db
      .insert(schema.uploadImages)
      .values({ uploadId: upload.id })
      .returning();
    const [file] = await db
      .insert(schema.uploadFiles)
      .values({
        imageId: image.id,
        variant: 'original',
        objectKey: `uploads/${upload.id}/0.jpg`,
        contentType: 'image/jpeg',
      })
      .returning();
    const otherAuth = `Bearer ${app.get(TokenService).generateAccessToken(other)}`;
    const grantProperty = (resourceId: string) =>
      app.get(AccessRepository).createGrant({
        subjectUserId: other.id,
        grantedByUserId: owner.id,
        resourceType: 'property',
        resourceId,
      });
    const list = (auth: string, query: Record<string, string> = {}) =>
      request(app.getHttpServer())
        .get('/api/uploads')
        .set('Authorization', auth)
        .query(query)
        .expect(200);
    const detail = () =>
      request(app.getHttpServer()).get(`/api/uploads/${upload.id}`).set('Authorization', otherAuth);
    await grantProperty(property.id);
    expect((await list(otherAuth)).body.total).toBe(1);
    await detail().expect(200);

    await catalog.updateTalhao(talhao.id, { propertyId: destination.id });
    expect((await list(otherAuth)).body.total).toBe(0);
    await detail().expect(404);
    expect((await list(ownerAuth, { propertyId: property.id })).body.total).toBe(0);
    const filtered = await list(ownerAuth, { propertyId: destination.id });
    expect(filtered.body).toMatchObject({
      total: 1,
      uploads: [{ id: upload.id, propertyId: destination.id, propertyName: 'Destination' }],
    });
    expect((await list(ownerAuth, { search: 'Destination' })).body.total).toBe(1);
    await grantProperty(destination.id);
    expect((await list(otherAuth, { propertyId: destination.id })).body.total).toBe(1);
    expect((await detail().expect(200)).body.propertyId).toBe(destination.id);
    for (const row of [
      await uploads.findById(upload.id),
      await uploads.findByIdAnyStatus(upload.id),
      await uploads.findByClientUploadId(owner.id, upload.clientUploadId),
      ...(await uploads.listByIds([upload.id])),
      ...(await uploads.listByUserId(owner.id)),
    ]) {
      expect(row?.propertyId).toBe(destination.id);
    }

    await catalog.softDeleteProperty(property.id);
    expect(await uploads.findById(upload.id)).toBeDefined();
    await catalog.softDeleteProperty(destination.id);
    expect(await uploads.findById(upload.id)).toBeUndefined();
    expect(await uploads.findByIdAnyStatus(upload.id)).toMatchObject({
      propertyId: destination.id,
      deletedAt: expect.any(Date),
    });
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uploadId: upload.id, objectKey: file.objectKey }),
      ]),
    );
  });

  it('enforces estadio/crop pairs on writes and cascades reparenting, including deleted uploads', async () => {
    const { talhao, crop } = await catalogFixture();
    const [destination] = await db
      .insert(schema.cropTypes)
      .values({ userId: owner.id, name: 'Other crop', normalizedName: 'other crop' })
      .returning();
    const [stage] = await db
      .insert(schema.estadios)
      .values({ userId: owner.id, cropTypeId: crop.id, name: 'Stage', normalizedName: 'stage' })
      .returning();
    const data = {
      userId: owner.id,
      talhaoId: talhao.id,
      cropTypeId: crop.id,
      source: 'phone',
      activityDate: new Date(),
      latitude: 0,
      longitude: 0,
    };
    const [withoutStage, withStage, deleted] = await db
      .insert(schema.uploads)
      .values([
        { ...data, clientUploadId: randomUUID() },
        { ...data, clientUploadId: randomUUID(), estadioId: stage.id },
        { ...data, clientUploadId: randomUUID(), estadioId: stage.id, deletedAt: new Date() },
      ])
      .returning();
    const violation = { cause: { code: '23503', constraint_name: 'uploads_estadio_crop_type_fk' } };
    await expect(
      db.insert(schema.uploads).values({
        ...data,
        clientUploadId: randomUUID(),
        estadioId: stage.id,
        cropTypeId: destination.id,
      }),
    ).rejects.toMatchObject(violation);
    await expect(
      db
        .update(schema.uploads)
        .set({ cropTypeId: destination.id })
        .where(eq(schema.uploads.id, withStage.id)),
    ).rejects.toMatchObject(violation);
    await expect(
      db
        .update(schema.uploads)
        .set({ estadioId: randomUUID() })
        .where(eq(schema.uploads.id, withoutStage.id)),
    ).rejects.toMatchObject(violation);

    await app.get(CatalogRepository).updateEstadio(stage.id, { cropTypeId: destination.id });
    const uploads = app.get(UploadsRepository);
    expect(await uploads.findById(withStage.id)).toMatchObject({ cropTypeId: destination.id });
    expect(await uploads.findByIdAnyStatus(deleted.id)).toMatchObject({
      cropTypeId: destination.id,
    });
    expect(await uploads.findById(withoutStage.id)).toMatchObject({
      cropTypeId: crop.id,
      estadioId: null,
    });
    // Direct SQL parent writes receive the same protection as repository writes.
    await db
      .update(schema.estadios)
      .set({ cropTypeId: crop.id })
      .where(eq(schema.estadios.id, stage.id));
    expect(await uploads.findById(withStage.id)).toMatchObject({ cropTypeId: crop.id });
    expect(await uploads.renewDraft(withStage.id)).toMatchObject({ propertyId: talhao.propertyId });
    await expect(
      db.delete(schema.estadios).where(eq(schema.estadios.id, stage.id)),
    ).rejects.toMatchObject(violation);
  });

  it('lists dead jobs from both real queue tables through the admin API', async () => {
    const upload = await uploadFixture();
    const [finalization] = await db
      .insert(schema.uploadFinalizationJobs)
      .values({
        uploadId: upload.id,
        status: 'dead',
        attempts: 3,
        lastError: 'decode failed',
      })
      .returning();
    const [deletion] = await db
      .insert(schema.objectDeletionJobs)
      .values({
        objectKey: 'missing/key.jpg',
        status: 'dead',
        attempts: 3,
        runAfter: new Date(),
      })
      .returning();
    await db
      .insert(schema.objectDeletionJobs)
      .values({ objectKey: 'pending/key.jpg', runAfter: new Date() });
    const response = await request(app.getHttpServer())
      .get('/api/admin/jobs/dead')
      .set('Authorization', adminAuth)
      .expect(200);
    expect(response.body.jobs).toHaveLength(2);
    expect(response.body.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queue: 'upload_finalization',
          id: finalization.id,
          uploadId: upload.id,
          createdAt: expect.any(String),
        }),
        expect.objectContaining({
          queue: 'object_deletion',
          id: deletion.id,
          objectKey: deletion.objectKey,
          createdAt: expect.any(String),
        }),
      ]),
    );
    await request(app.getHttpServer())
      .get('/api/admin/jobs/dead')
      .set('Authorization', ownerAuth)
      .expect(403);
  });

  it('refuses a finalization retry when another job is active', async () => {
    const upload = await uploadFixture();
    await db
      .update(schema.uploads)
      .set({ status: 'failed' })
      .where(eq(schema.uploads.id, upload.id));
    const [dead] = await db
      .insert(schema.uploadFinalizationJobs)
      .values({ uploadId: upload.id, status: 'dead' })
      .returning();
    await db.insert(schema.uploadFinalizationJobs).values({ uploadId: upload.id });
    expect(await app.get(JobsRepository).retryDeadFinalizationJob(dead.id)).toEqual({
      status: 'active_job_exists',
    });
    const [stored] = await db
      .select()
      .from(schema.uploadFinalizationJobs)
      .where(eq(schema.uploadFinalizationJobs.id, dead.id));
    expect(stored.status).toBe('dead');
  });

  it.each(['properties', 'talhoes', 'crop-types', 'estadios'] as const)(
    'returns HTTP 409 for %s duplicate creation and renaming',
    async (resource) => {
      const { property, crop } = await catalogFixture();
      const fields = {
        properties: { owner: 'Owner', address: 'Address', latitude: 0, longitude: 0 },
        talhoes: { propertyId: property.id },
        'crop-types': {},
        estadios: { cropTypeId: crop.id },
      }[resource];
      const create = (name: string) =>
        request(app.getHttpServer())
          .post(`/api/${resource}`)
          .set('Authorization', ownerAuth)
          .send({ ...fields, name });
      await create('Original').expect(201);
      await create('Original').expect(409);
      const second = await create('Second').expect(201);
      const key = {
        properties: 'property',
        talhoes: 'talhao',
        'crop-types': 'cropType',
        estadios: 'estadio',
      }[resource];
      await request(app.getHttpServer())
        .patch(`/api/${resource}/${second.body[key].id}`)
        .set('Authorization', ownerAuth)
        .send({ name: 'Original' })
        .expect(409);
    },
  );

  it('handles concurrent grant creation using the actual Drizzle-wrapped unique violation', async () => {
    const { property } = await catalogFixture();
    const grant = { subjectUserId: other.id, resourceType: 'property', resourceId: property.id };
    let responses: Promise<request.Response[]> | undefined;
    try {
      await db.transaction(async (tx) => {
        // Allow both prechecks to read, but hold their INSERTs until both are ready.
        await tx.execute(sql`LOCK TABLE access_grants IN SHARE MODE`);
        responses = Promise.all(
          [0, 1].map(() =>
            request(app.getHttpServer())
              .post('/api/access-grants')
              .set('Authorization', ownerAuth)
              .send(grant)
              .then((response) => response),
          ),
        );
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const [row] = await db.execute(sql`
            SELECT count(*)::int AS waiting FROM pg_locks
            WHERE relation = 'access_grants'::regclass AND mode = 'RowExclusiveLock' AND NOT granted
          `);
          if (row.waiting === 2) return;
          await wait(10);
        }
        throw new Error('Both grant inserts did not reach the held table lock');
      });
    } finally {
      await responses;
    }
    expect((await responses)!.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(schema.accessGrants)).toHaveLength(1);
    expect(await db.select().from(schema.auditEvents)).toHaveLength(1);
    const error: unknown = await app
      .get(AccessRepository)
      .createGrant({ ...grant, grantedByUserId: owner.id })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DrizzleQueryError);
    expect(isUniqueViolation(error)).toBe(true);
  });

  it('includes only owned active estadio grants and applies filters, totals and pagination', async () => {
    const { crop } = await catalogFixture();
    const [owned, foreign, deleted] = await db
      .insert(schema.estadios)
      .values([
        { userId: owner.id, cropTypeId: crop.id, name: 'Owned', normalizedName: 'owned' },
        { userId: other.id, cropTypeId: crop.id, name: 'Foreign', normalizedName: 'foreign' },
        {
          userId: owner.id,
          cropTypeId: crop.id,
          name: 'Deleted',
          normalizedName: 'deleted',
          deletedAt: new Date(),
        },
      ])
      .returning();
    const [first, second] = await db
      .insert(schema.accessGrants)
      .values([
        {
          resourceType: 'estadio',
          resourceId: owned.id,
          subjectUserId: other.id,
          grantedByUserId: owner.id,
        },
        {
          resourceType: 'estadio',
          resourceId: owned.id,
          subjectUserId: admin.id,
          grantedByUserId: owner.id,
        },
        {
          resourceType: 'estadio',
          resourceId: foreign.id,
          subjectUserId: owner.id,
          grantedByUserId: other.id,
        },
        {
          resourceType: 'estadio',
          resourceId: deleted.id,
          subjectUserId: other.id,
          grantedByUserId: owner.id,
        },
        {
          resourceType: 'estadio',
          resourceId: owned.id,
          subjectUserId: other.id,
          grantedByUserId: owner.id,
          revokedAt: new Date(),
        },
      ])
      .returning();
    const list = (query: Record<string, string | number> = {}) =>
      request(app.getHttpServer())
        .get('/api/access-grants')
        .set('Authorization', ownerAuth)
        .query(query)
        .expect(200);
    const all = await list();
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((grant: { id: string }) => grant.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const filtered = await list({
      resourceType: 'estadio',
      resourceId: owned.id,
      subjectUserId: other.id,
    });
    expect(filtered.body).toMatchObject({ total: 1, items: [{ id: first.id }] });
    const pages = await Promise.all([
      list({ page: 1, pageSize: 1 }),
      list({ page: 2, pageSize: 1 }),
    ]);
    expect(pages.map((page) => page.body.total)).toEqual([2, 2]);
    expect(
      pages
        .flatMap((page) => page.body.items)
        .map((grant: { id: string }) => grant.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect((await list({ resourceId: foreign.id })).body).toEqual({
      total: 0,
      items: [],
      limit: 50,
      offset: 0,
    });
  });
});
