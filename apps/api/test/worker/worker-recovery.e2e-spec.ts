import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { setTimeout as wait } from 'node:timers/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import type { DatabaseConnection } from '../../src/database/database.constants';
import * as schema from '../../src/database/schema';
import { JobsRepository } from '../../src/database/repositories/jobs.repository';
import { InferenceRepository } from '../../src/database/repositories/inference.repository';
import { UploadsRepository } from '../../src/database/repositories/uploads.repository';
import { RetentionRepository } from '../../src/database/repositories/retention.repository';
import { UsersRepository } from '../../src/database/repositories/users.repository';
import { WorkerObservabilityRepository } from '../../src/database/repositories/worker-observability.repository';
import { CatalogRepository } from '../../src/database/repositories/catalog.repository';
import { StorageService } from '../../src/storage/storage.service';
import { ImageProcessingService } from '../../src/image-processing/image-processing.service';
import { FinalizationService } from '../../src/worker/finalization.service';
import { DeletionService } from '../../src/worker/deletion.service';
import { AbandonedUploadCleanupService } from '../../src/worker/abandoned-upload-cleanup.service';
import sharp from 'sharp';

// Requires a migrated, disposable PostgreSQL database, as do the other E2E suites.
describe('Worker recovery (PostgreSQL)', () => {
  let client: ReturnType<typeof postgres>;
  let reaperClient: ReturnType<typeof postgres>;
  let db: DatabaseConnection;
  let jobs: JobsRepository;
  let inference: InferenceRepository;
  let reaperPid: number;
  let userId: string;
  let storage: StorageService;
  const config = new ConfigService({
    ...process.env,
    S3_FORCE_PATH_STYLE: true,
    CORS_ORIGINS: [],
    UPLOAD_PRESIGNED_URL_TTL_SECONDS: 900,
  });
  const leaseMs = 120_000;
  const staleAt = () => new Date(Date.now() - 15 * 60 * 1000);

  beforeAll(async () => {
    client = postgres(process.env.DATABASE_URL!, { max: 5, onnotice: () => {} });
    reaperClient = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    db = drizzle(client, { schema });
    const reaperDb = drizzle(reaperClient, { schema });
    jobs = new JobsRepository(reaperDb);
    inference = new InferenceRepository(db, new ConfigService());
    const [row] = await reaperDb.execute(sql`SELECT pg_backend_pid() AS pid`);
    reaperPid = Number(row.pid);
    storage = new StorageService(config);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'worker-recovery@example.com',
        fullName: 'Worker Recovery',
        passwordHash: 'unused',
      })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    storage?.onApplicationShutdown();
    await Promise.all([client?.end(), reaperClient?.end()]);
  });

  async function finalizationFixture() {
    const [property] = await db
      .insert(schema.properties)
      .values({
        userId,
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
        userId,
        propertyId: property.id,
        name: 'Plot',
        normalizedName: 'plot',
      })
      .returning();
    const [crop] = await db
      .insert(schema.cropTypes)
      .values({
        userId,
        name: 'Crop',
        normalizedName: 'crop',
      })
      .returning();
    const [upload] = await db
      .insert(schema.uploads)
      .values({
        userId,
        talhaoId: talhao.id,
        cropTypeId: crop.id,
        clientUploadId: randomUUID(),
        source: 'phone',
        status: 'finalizing',
        activityDate: new Date(),
        latitude: 0,
        longitude: 0,
      })
      .returning();
    const [job] = await db
      .insert(schema.uploadFinalizationJobs)
      .values({
        uploadId: upload.id,
        status: 'running',
        attempts: 3,
        lockedAt: staleAt(),
        lockedBy: 'original-worker',
        lockToken: randomUUID(),
      })
      .returning();
    return { upload, job, property };
  }

  async function waitUntilReaperBlocksOnUpload() {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const [row] = await db.execute(sql`
        SELECT cardinality(pg_blocking_pids(${reaperPid})) > 0 AS blocked
      `);
      if (row.blocked) return;
      await wait(10);
    }
    throw new Error('Reaper did not reach the held upload lock');
  }

  it.each(['completed', 'renewed', 'requeued'] as const)(
    'preserves a job %s after the reaper snapshots it',
    async (transition) => {
      const { upload, job } = await finalizationFixture();
      let reaping: ReturnType<JobsRepository['claimFinalizationJob']> | undefined;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM uploads WHERE id = ${upload.id} FOR UPDATE`);
          reaping = jobs.claimFinalizationJob('reaper', leaseMs, 3);
          await waitUntilReaperBlocksOnUpload();
          const concurrentWorker = new JobsRepository(tx);
          if (transition === 'completed') {
            expect(
              await concurrentWorker.completeFinalizationAndUpload(
                job.id,
                upload.id,
                job.lockToken!,
              ),
            ).toBe(true);
          } else if (transition === 'renewed') {
            expect(await concurrentWorker.touchFinalizationJob(job.id, job.lockToken!)).toBe(true);
          } else {
            await concurrentWorker.failFinalizationAndUpload(
              job.id,
              upload.id,
              job.lockToken!,
              'retryable',
              3,
            );
            expect(await concurrentWorker.retryDeadFinalizationJob(job.id)).toEqual({
              status: 'requeued',
            });
            await tx
              .update(schema.uploadFinalizationJobs)
              .set({ retryAfter: new Date(Date.now() + 60_000) })
              .where(eq(schema.uploadFinalizationJobs.id, job.id));
          }
        });
      } finally {
        await reaping;
      }
      const [storedJob] = await db
        .select()
        .from(schema.uploadFinalizationJobs)
        .where(eq(schema.uploadFinalizationJobs.id, job.id));
      const [storedUpload] = await db
        .select()
        .from(schema.uploads)
        .where(eq(schema.uploads.id, upload.id));
      expect(storedJob.status).toBe(
        { completed: 'completed', renewed: 'running', requeued: 'pending' }[transition],
      );
      expect(storedUpload.status).toBe(transition === 'completed' ? 'ready' : 'finalizing');
      if (transition === 'completed') expect(storedJob.completedAt).toBeInstanceOf(Date);
      if (transition === 'renewed') expect(storedJob.lockToken).toBe(job.lockToken);
      if (transition === 'requeued') expect(storedJob.attempts).toBe(0);
    },
  );

  it('marks a genuinely expired final attempt and its upload terminal', async () => {
    const { upload, job } = await finalizationFixture();
    await expect(jobs.claimFinalizationJob('reaper', leaseMs, 3)).resolves.toBeUndefined();
    const [storedJob] = await db
      .select()
      .from(schema.uploadFinalizationJobs)
      .where(eq(schema.uploadFinalizationJobs.id, job.id));
    const [storedUpload] = await db
      .select()
      .from(schema.uploads)
      .where(eq(schema.uploads.id, upload.id));
    expect(storedJob).toMatchObject({ status: 'dead', lockToken: null, lockedAt: null });
    expect(storedUpload.status).toBe('failed');
    await expect(jobs.claimFinalizationJob('reaper', leaseMs, 3)).resolves.toBeUndefined();
  });

  async function modelFixture(overrides: Partial<typeof schema.inferenceModels.$inferInsert> = {}) {
    const [model] = await db
      .insert(schema.inferenceModels)
      .values({
        name: randomUUID(),
        version: '1',
        objectKey: `models/${randomUUID()}/best.pt`,
        sizeBytes: 1,
        createdByUserId: userId,
        status: 'validating',
        validationAttempts: 3,
        updatedAt: staleAt(),
        ...overrides,
      })
      .returning();
    return model;
  }

  it('renews only draft or failed, non-deleted uploads', async () => {
    const { upload } = await finalizationFixture();
    const uploads = new UploadsRepository(db);
    for (const status of ['finalizing', 'ready']) {
      await db.update(schema.uploads).set({ status }).where(eq(schema.uploads.id, upload.id));
      expect(await uploads.renewDraft(upload.id)).toBeUndefined();
      expect((await uploads.findById(upload.id))!.status).toBe(status);
    }
    await db
      .update(schema.uploads)
      .set({ status: 'failed' })
      .where(eq(schema.uploads.id, upload.id));
    expect(await uploads.renewDraft(upload.id)).toMatchObject({ status: 'draft' });
    expect(await uploads.renewDraft(upload.id)).toMatchObject({ status: 'draft' });
    await db
      .update(schema.uploads)
      .set({ status: 'failed', deletedAt: new Date() })
      .where(eq(schema.uploads.id, upload.id));
    expect(await uploads.renewDraft(upload.id)).toBeUndefined();
  });

  it.each(['failure', 'lease expiry'])(
    'retains old deletion jobs after a fresh terminal %s',
    async (mode) => {
      const old = new Date(Date.now() - 8 * 86400000);
      const [job] = await db
        .insert(schema.objectDeletionJobs)
        .values({
          objectKey: 'old-object',
          runAfter: old,
          createdAt: old,
          status: 'running',
          attempts: 3,
          lockedAt: staleAt(),
          lockToken: randomUUID(),
        })
        .returning();
      if (mode === 'failure') {
        expect(await jobs.failDeletionJob(job.id, job.lockToken!, 'storage unavailable', 3)).toBe(
          'dead',
        );
      } else {
        expect(await jobs.claimDeletionJob('reaper', leaseMs, 3)).toBeUndefined();
      }
      const retention = new RetentionRepository(db);
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      expect((await retention.pruneExpired(cutoff, 20)).deletionJobs).toBe(0);
      const [stored] = await db
        .select()
        .from(schema.objectDeletionJobs)
        .where(eq(schema.objectDeletionJobs.id, job.id));
      expect(stored.completedAt).toBeInstanceOf(Date);
      await db
        .update(schema.objectDeletionJobs)
        .set({ completedAt: old })
        .where(eq(schema.objectDeletionJobs.id, job.id));
      expect((await retention.pruneExpired(cutoff, 20)).deletionJobs).toBe(0);
      await db
        .update(schema.objectDeletionJobs)
        .set({ status: 'completed' })
        .where(eq(schema.objectDeletionJobs.id, job.id));
      expect((await retention.pruneExpired(cutoff, 20)).deletionJobs).toBe(1);
    },
  );

  it('exhausts crashed inference images, updates counters, and rejects late success', async () => {
    const model = await modelFixture({ status: 'ready', active: true });
    const job = await inference.createJobWithImages(
      {
        userId,
        modelId: model.id,
        modelSnapshot: { id: model.id, name: model.name, version: model.version },
        sourceType: 'temporary',
        status: 'running',
        imageCount: 1,
      },
      [
        {
          imageIndex: 0,
          fileName: 'image.jpg',
          sourceObjectKey: 'temporary/image.jpg',
          status: 'running',
          attempts: 3,
          updatedAt: staleAt(),
        },
      ],
    );
    const [image] = await inference.listImagesByJobId(job.id);
    expect(await inference.claimNextImage(job.id, 3)).toBeUndefined();
    expect(await inference.listQueuedJobIds()).toEqual([]);
    await inference.failExhaustedImages(3);
    expect(await inference.findJobById(job.id)).toMatchObject({
      status: 'failed',
      failedCount: 1,
      completedCount: 0,
    });
    expect(await inference.completeImage(image.id, { detections: [] }, 3)).toBeUndefined();
    expect((await inference.listImagesByJobId(job.id))[0].status).toBe('failed');
  });

  it('revokes a refresh replacement committed while family revocation waits', async () => {
    const familyId = randomUUID();
    const [original] = await db
      .insert(schema.refreshTokens)
      .values({
        userId,
        familyId,
        tokenHash: 'original',
        expiresAt: new Date(Date.now() + 60000),
      })
      .returning();
    const revoker = new UsersRepository(drizzle(reaperClient, { schema }));
    let revoking: Promise<void> | undefined;
    try {
      await db.transaction(async (tx) => {
        const rotated = await new UsersRepository(tx).replaceRefreshToken(original.id, {
          userId,
          familyId,
          tokenHash: 'replacement',
          expiresAt: new Date(Date.now() + 60000),
        });
        expect(rotated).toBeDefined();
        revoking = revoker.revokeRefreshTokenFamily(familyId);
        await waitUntilReaperBlocksOnUpload();
      });
    } finally {
      await revoking;
    }
    const tokens = await db.select().from(schema.refreshTokens);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it.each(['temporary', 'upload'] as const)(
    'rejects %s job creation after a concurrent model deletion',
    async (sourceType) => {
      const model = await modelFixture({ status: 'ready', active: true });
      const { upload } = await finalizationFixture();
      await db
        .update(schema.uploads)
        .set({ status: 'ready' })
        .where(eq(schema.uploads.id, upload.id));
      const creator = new InferenceRepository(
        drizzle(reaperClient, { schema }),
        new ConfigService(),
      );
      const job = {
        userId,
        modelId: model.id,
        modelSnapshot: {},
        sourceType,
        uploadId: sourceType === 'upload' ? upload.id : null,
        imageCount: 1,
        status: 'queued',
      };
      const images = [{ imageIndex: 0, fileName: 'image.jpg', sourceObjectKey: 'image.jpg' }];
      let creating: Promise<unknown> | undefined;
      try {
        await db.transaction(async (tx) => {
          const deleting = new InferenceRepository(tx, new ConfigService());
          await deleting.updateModel(model.id, { active: false });
          expect(await deleting.softDeleteModel(model.id)).toBeDefined();
          creating = (
            sourceType === 'temporary'
              ? creator.createJobWithImages(job, images)
              : creator.createUploadJobWithFence(job, images, [])
          ).catch((error: unknown) => error);
          await waitUntilReaperBlocksOnUpload();
        });
      } finally {
        await creating;
      }
      expect(await creating).toMatchObject({ message: 'Model is not available for inference' });
      expect(await db.select().from(schema.inferenceJobs)).toEqual([]);
    },
  );

  it('rejects model deletion when a concurrent job commits first', async () => {
    const model = await modelFixture({ status: 'ready', active: true });
    const deleter = new InferenceRepository(drizzle(reaperClient, { schema }), new ConfigService());
    let deleting: Promise<unknown> | undefined;
    try {
      await db.transaction(async (tx) => {
        const creator = new InferenceRepository(tx, new ConfigService());
        await creator.createJobWithImages(
          { userId, modelId: model.id, modelSnapshot: {}, sourceType: 'temporary' },
          [],
        );
        await creator.updateModel(model.id, { active: false });
        deleting = deleter.softDeleteModel(model.id).catch((error: unknown) => error);
        await waitUntilReaperBlocksOnUpload();
      });
    } finally {
      await deleting;
    }
    expect(await deleting).toMatchObject({
      message: 'Cannot delete a model with active (non-terminal) jobs',
    });
    expect(await inference.findModelById(model.id)).toBeDefined();
    expect(await db.select().from(schema.objectDeletionJobs)).toEqual([]);
  });

  it('reports only overdue eligible work as a queue-age failure', async () => {
    const old = new Date(Date.now() - 2 * 86400000);
    const future = new Date(Date.now() + 86400000);
    const [deletion] = await db
      .insert(schema.objectDeletionJobs)
      .values({
        objectKey: 'scheduled',
        createdAt: old,
        runAfter: future,
      })
      .returning();
    const { job } = await finalizationFixture();
    await db
      .update(schema.uploadFinalizationJobs)
      .set({ status: 'pending', createdAt: old, retryAfter: future })
      .where(eq(schema.uploadFinalizationJobs.id, job.id));
    await modelFixture({ status: 'invalid', deletedAt: new Date() });
    const model = await modelFixture({ status: 'ready', active: true });
    await inference.createJobWithImages(
      { userId, modelId: model.id, modelSnapshot: {}, sourceType: 'temporary', createdAt: old },
      [{ imageIndex: 0, fileName: 'waiting.jpg', sourceObjectKey: 'waiting.jpg', createdAt: old }],
    );
    const health = new WorkerObservabilityRepository(db);
    expect((await health.getHealth(900000, 1)).status).toBe('ok');
    await db
      .update(schema.objectDeletionJobs)
      .set({ runAfter: old })
      .where(eq(schema.objectDeletionJobs.id, deletion.id));
    expect((await health.getHealth(900000, 1)).status).toBe('unhealthy');
  });

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  async function storedUploadFixture() {
    const { upload, job, property } = await finalizationFixture();
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: 'green' },
    })
      .png()
      .toBuffer();
    const finalKey = `uploads/${userId}/${upload.id}/0/original.png`;
    const stagingKey = `staging/${finalKey}`;
    const { etag } = await storage.putObject(stagingKey, buffer, 'image/png');
    await db.insert(schema.uploadFiles).values({
      uploadId: upload.id,
      imageIndex: 0,
      variant: 'original',
      contentType: 'image/png',
      objectKey: stagingKey,
      observedEtag: etag!.replace(/^"|"$/g, ''),
      sizeBytes: buffer.length,
    });
    await db
      .update(schema.uploadFinalizationJobs)
      .set({ status: 'pending', attempts: 0, lockedAt: null, lockToken: null })
      .where(eq(schema.uploadFinalizationJobs.id, job.id));
    const images = new ImageProcessingService(new ConfigService());
    const worker = new FinalizationService(
      new ConfigService(),
      new UploadsRepository(db),
      new JobsRepository(db),
      storage,
      images,
      db,
    );
    return { upload, job, property, buffer, stagingKey, finalKey, images, worker };
  }

  it.each(['before publication', 'during publication'] as const)(
    'coordinates catalog deletion %s with an in-flight finalizer',
    async (phase) => {
      const fixture = await storedUploadFixture();
      const reached = deferred();
      const release = deferred();
      const generate = fixture.images.generatePreview.bind(fixture.images);
      const put = storage.putObject.bind(storage);
      const pause = async () => {
        reached.resolve();
        await release.promise;
      };
      const spy =
        phase === 'before publication'
          ? jest.spyOn(fixture.images, 'generatePreview').mockImplementation(async (buffer) => {
              const result = await generate(buffer);
              await pause();
              return result;
            })
          : jest.spyOn(storage, 'putObject').mockImplementation(async (key, buffer, type) => {
              const result = await put(key, buffer, type);
              if (key === fixture.finalKey) await pause();
              return result;
            });
      const finalizing = fixture.worker.processNextJob();
      let deleting: Promise<unknown> | undefined;
      try {
        await reached.promise;
        const catalog = new CatalogRepository(drizzle(reaperClient, { schema }));
        deleting = catalog.softDeleteProperty(fixture.property.id);
        if (phase === 'during publication') await waitUntilReaperBlocksOnUpload();
        else await deleting;
      } finally {
        release.resolve();
        await Promise.all([finalizing, deleting]);
        spy.mockRestore();
      }
      const files = await new UploadsRepository(db).findFilesByUploadId(fixture.upload.id);
      const deletionKeys = (await db.select().from(schema.objectDeletionJobs)).map(
        (row) => row.objectKey,
      );
      expect(deletionKeys).toEqual(
        expect.arrayContaining([
          fixture.stagingKey,
          fixture.finalKey,
          `uploads/${userId}/${fixture.upload.id}/0/preview.jpg`,
        ]),
      );
      expect(
        (await new UploadsRepository(db).findByIdAnyStatus(fixture.upload.id))!.deletedAt,
      ).not.toBeNull();
      if (phase === 'before publication') {
        expect(files).toHaveLength(1);
        expect(files[0].objectKey).toBe(fixture.stagingKey);
        expect((await storage.headObject(fixture.finalKey)).exists).toBe(false);
      }
    },
  );

  it('prevents a reclaimed finalizer from publishing storage or file metadata', async () => {
    const fixture = await storedUploadFixture();
    const generate = fixture.images.generatePreview.bind(fixture.images);
    const spy = jest.spyOn(fixture.images, 'generatePreview').mockImplementation(async (buffer) => {
      await db
        .update(schema.uploadFinalizationJobs)
        .set({ lockedAt: staleAt() })
        .where(eq(schema.uploadFinalizationJobs.id, fixture.job.id));
      expect(await jobs.claimFinalizationJob('replacement', leaseMs, 3)).toMatchObject({
        id: fixture.job.id,
        attempts: 2,
      });
      return generate(buffer);
    });
    try {
      expect(await fixture.worker.processNextJob()).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect((await storage.headObject(fixture.finalKey)).exists).toBe(false);
    const files = await new UploadsRepository(db).findFilesByUploadId(fixture.upload.id);
    expect(files).toHaveLength(1);
    expect(files[0].objectKey).toBe(fixture.stagingKey);
  });

  it('renews old drafts and defers abandoned cleanup beyond an outstanding PUT URL', async () => {
    const fixture = await storedUploadFixture();
    const old = new Date(Date.now() - 2 * 86400000);
    await db
      .update(schema.uploads)
      .set({ status: 'draft', createdAt: old, updatedAt: old })
      .where(eq(schema.uploads.id, fixture.upload.id));
    const uploads = new UploadsRepository(db);
    const cleanup = new AbandonedUploadCleanupService(config, uploads, new RetentionRepository(db));
    expect(await uploads.renewDraft(fixture.upload.id)).toMatchObject({ status: 'draft' });
    expect((await cleanup.cleanup()).drafts.deleted).toBe(0);

    const issued = await storage.getPresignedPutUrl(fixture.stagingKey, 'image/png', 900);
    await db
      .update(schema.uploads)
      .set({ updatedAt: old })
      .where(eq(schema.uploads.id, fixture.upload.id));
    expect((await cleanup.cleanup()).drafts.deleted).toBe(1);
    expect(await uploads.renewDraft(fixture.upload.id)).toBeUndefined();
    const queued = await db.select().from(schema.objectDeletionJobs);
    expect(queued.every((job) => job.runAfter >= issued.expiresAt)).toBe(true);
    const deletion = new DeletionService(new ConfigService(), new JobsRepository(db), storage);
    expect(await deletion.processNextJob()).toBe(false);
    const put = await fetch(issued.url, {
      method: 'PUT',
      body: new Uint8Array(fixture.buffer),
      headers: issued.headers,
    });
    expect(put.ok).toBe(true);
    await put.arrayBuffer();
    expect((await storage.headObject(fixture.stagingKey)).exists).toBe(true);
    await db.update(schema.objectDeletionJobs).set({ runAfter: old });
    for (let i = 0; i < queued.length; i++) expect(await deletion.processNextJob()).toBe(true);
    expect((await storage.headObject(fixture.stagingKey)).exists).toBe(false);
  });

  it('recovers a model after a crash on the final validation attempt and rejects late results', async () => {
    const model = await modelFixture({ validationAttempts: 2 });
    const claimed = await inference.claimValidation();
    expect(claimed).toMatchObject({ id: model.id, validationAttempts: 3, status: 'validating' });
    await db
      .update(schema.inferenceModels)
      .set({ updatedAt: staleAt() })
      .where(eq(schema.inferenceModels.id, model.id));
    await expect(inference.claimValidation()).resolves.toBeUndefined();
    expect(await inference.findModelById(model.id)).toMatchObject({
      status: 'invalid',
      errorMessage: 'validation lease expired at max attempts',
    });
    await expect(
      inference.completeValidation(model.id, 3, { status: 'ready', errorMessage: null }),
    ).resolves.toBeUndefined();
    expect((await inference.findModelById(model.id))!.status).toBe('invalid');
  });

  it('preserves fresh, ready and deleted models while reclaiming retryable validation', async () => {
    const fresh = await modelFixture({ updatedAt: new Date() });
    const ready = await modelFixture({ status: 'ready' });
    const deleted = await modelFixture({ deletedAt: new Date() });
    const retryable = await modelFixture({ validationAttempts: 1 });
    expect(await inference.claimValidation()).toMatchObject({
      id: retryable.id,
      validationAttempts: 2,
    });
    const rows = await db.select().from(schema.inferenceModels);
    expect(rows.find((row) => row.id === fresh.id)!.status).toBe('validating');
    expect(rows.find((row) => row.id === ready.id)!.status).toBe('ready');
    expect(rows.find((row) => row.id === deleted.id)!.status).toBe('validating');
    await expect(
      inference.completeValidation(retryable.id, 1, {
        status: 'invalid',
        errorMessage: 'stale error',
      }),
    ).resolves.toBeUndefined();
    expect(
      await inference.completeValidation(retryable.id, 2, { status: 'ready', errorMessage: null }),
    ).toMatchObject({ status: 'ready' });
    await expect(inference.claimValidation()).resolves.toBeUndefined();
  });
});
