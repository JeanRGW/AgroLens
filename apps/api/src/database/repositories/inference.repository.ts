import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, or, isNull, gte, desc, asc, sql, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import {
  inferenceModels,
  inferenceJobs,
  inferenceJobImages,
  objectDeletionJobs,
  auditEvents,
} from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { toCamelCase, namedError } from '../database.utils';

export type InferenceJob = InferSelectModel<typeof inferenceJobs>;
export type NewInferenceJob = InferInsertModel<typeof inferenceJobs>;

export type InferenceJobImage = InferSelectModel<typeof inferenceJobImages>;
export type NewInferenceJobImage = InferInsertModel<typeof inferenceJobImages>;

/** Images still running for this long are considered stale and eligible for reclaim. */
const STALE_RUNNING_MS = 10 * 60 * 1000;
/** Fixed delay between image retry attempts. */
const IMAGE_RETRY_BACKOFF_MS = 30 * 1000;

@Injectable()
export class InferenceRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
    private readonly config: ConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  //  Inference Jobs
  // ═══════════════════════════════════════════════════════════════════

  /** Create a job with images in a transaction. */
  async createJobWithImages(
    jobData: NewInferenceJob,
    imageData: Omit<NewInferenceJobImage, 'jobId'>[],
    audit?: { actorUserId: string; metadata?: unknown },
  ): Promise<InferenceJob> {
    return this.db.transaction(async (tx) => {
      await this.lockAvailableModel(tx, jobData.modelId);
      const [job] = await tx.insert(inferenceJobs).values(jobData).returning();
      if (imageData.length > 0) {
        const imagesWithJob = imageData.map((img) => ({ ...img, jobId: job.id }));
        await tx.insert(inferenceJobImages).values(imagesWithJob);
      }
      if (audit) {
        await tx.insert(auditEvents).values({
          eventType: 'job_create',
          actorUserId: audit.actorUserId,
          resourceType: 'inference_job',
          resourceId: job.id,
          metadata: audit.metadata,
        });
      }
      return job;
    });
  }

  async createUploadJobWithFence(
    job: NewInferenceJob,
    images: Omit<NewInferenceJobImage, 'jobId'>[],
    observations: Array<{ id: string; observedEtag: string; sizeBytes: number }>,
    audit?: { actorUserId: string; metadata?: unknown },
  ): Promise<InferenceJob> {
    return this.db.transaction(async (tx) => {
      await this.lockAvailableModel(tx, job.modelId);
      const upload = await tx.execute(
        sql`SELECT id FROM uploads WHERE id = ${job.uploadId} AND status = 'ready' AND deleted_at IS NULL FOR UPDATE`,
      );
      if (upload.length !== 1) throw namedError('UPLOAD_NOT_READY');
      for (const observation of observations) {
        const rows = await tx.execute(
          sql`SELECT file.observed_etag FROM upload_files file JOIN upload_images image ON file.image_id = image.id WHERE file.id = ${observation.id} AND image.upload_id = ${job.uploadId} AND file.variant = 'original' FOR UPDATE OF file`,
        );
        if (rows.length !== 1) throw namedError('UPLOAD_FILE_CHANGED');
        const existing = (rows[0] as { observed_etag: string | null }).observed_etag;
        if (existing && existing !== observation.observedEtag)
          throw namedError('UPLOAD_SEAL_MISMATCH');
        if (!existing)
          await tx.execute(
            sql`UPDATE upload_files SET observed_etag = ${observation.observedEtag}, size_bytes = ${observation.sizeBytes} WHERE id = ${observation.id} AND observed_etag IS NULL`,
          );
      }
      const [created] = await tx.insert(inferenceJobs).values(job).returning();
      await tx
        .insert(inferenceJobImages)
        .values(images.map((image) => ({ ...image, jobId: created.id })));
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'job_create',
          actorUserId: audit.actorUserId,
          resourceType: 'inference_job',
          resourceId: created.id,
          metadata: audit.metadata,
        });
      return created;
    });
  }

  private async lockAvailableModel(tx: DatabaseConnection, modelId: string): Promise<void> {
    const [model] = await tx
      .select({ id: inferenceModels.id })
      .from(inferenceModels)
      .where(
        and(
          eq(inferenceModels.id, modelId),
          eq(inferenceModels.status, 'ready'),
          eq(inferenceModels.active, true),
          sql`${inferenceModels.deletedAt} IS NULL`,
        ),
      )
      .for('share');
    if (!model) throw new ConflictException('Model is not available for inference');
  }

  async findJobById(id: string): Promise<InferenceJob | undefined> {
    const [row] = await this.db
      .select()
      .from(inferenceJobs)
      .where(eq(inferenceJobs.id, id))
      .limit(1);
    return row;
  }

  async listJobsByUserId(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ jobs: InferenceJob[]; total: number }> {
    const where = and(
      eq(inferenceJobs.userId, userId),
      or(isNull(inferenceJobs.expiresAt), gte(inferenceJobs.expiresAt, new Date())),
    );
    const jobs = await this.db
      .select()
      .from(inferenceJobs)
      .where(where)
      .orderBy(desc(inferenceJobs.createdAt), desc(inferenceJobs.id))
      .limit(limit)
      .offset(offset);
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(inferenceJobs)
      .where(where);
    return { jobs, total: count?.total ?? 0 };
  }

  async findImageById(jobId: string, imageId: string): Promise<InferenceJobImage | undefined> {
    const [image] = await this.db
      .select()
      .from(inferenceJobImages)
      .where(and(eq(inferenceJobImages.jobId, jobId), eq(inferenceJobImages.id, imageId)))
      .limit(1);
    return image;
  }

  async listImagesByJobId(jobId: string): Promise<InferenceJobImage[]> {
    return this.db
      .select()
      .from(inferenceJobImages)
      .where(eq(inferenceJobImages.jobId, jobId))
      .orderBy(asc(inferenceJobImages.imageIndex));
  }

  async sealAndCompleteTemporaryJob(
    jobId: string,
    seals: Array<{ id: string; observedEtag: string; sizeBytes: number }>,
  ): Promise<InferenceJob | undefined> {
    return this.db.transaction(async (tx) => {
      const [lockedJob] = await tx
        .select({ status: inferenceJobs.status, imageCount: inferenceJobs.imageCount })
        .from(inferenceJobs)
        .where(eq(inferenceJobs.id, jobId))
        .for('update');
      if (!lockedJob) return undefined;
      if (lockedJob.status !== 'uploading')
        throw new Error(`Temporary job ${jobId} is no longer uploading`);
      if (lockedJob.imageCount !== seals.length)
        throw new Error('Temporary job image set changed during completion');

      const images = await tx
        .select({ id: inferenceJobImages.id })
        .from(inferenceJobImages)
        .where(eq(inferenceJobImages.jobId, jobId));
      if (images.length !== seals.length)
        throw new Error('Temporary job image set changed during completion');
      for (const seal of seals) {
        const updated = await tx
          .update(inferenceJobImages)
          .set({ observedEtag: seal.observedEtag, updatedAt: new Date() })
          .where(
            and(
              eq(inferenceJobImages.id, seal.id),
              eq(inferenceJobImages.jobId, jobId),
              eq(inferenceJobImages.status, 'queued'),
            ),
          )
          .returning({ id: inferenceJobImages.id });
        if (updated.length !== 1)
          throw new Error(`Inference image ${seal.id} changed during completion`);
      }
      const [row] = await tx
        .update(inferenceJobs)
        .set({ status: 'queued', imageCount: seals.length, updatedAt: new Date() })
        .where(and(eq(inferenceJobs.id, jobId), eq(inferenceJobs.status, 'uploading')))
        .returning();
      return row;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Inference Job Images – atomic claim & completion
  // ═══════════════════════════════════════════════════════════════════

  async claimNextImage(jobId: string, maxAttempts: number): Promise<InferenceJobImage | undefined> {
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
    const rows = await this.db.execute(sql`
      UPDATE inference_job_images SET
        status = 'running',
        attempts = attempts + 1,
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM inference_job_images
        WHERE job_id = ${jobId}
          AND attempts < ${maxAttempts}
          AND (
            (status = 'queued' AND (retry_after IS NULL OR retry_after <= NOW()))
            OR (status = 'running' AND updated_at < ${staleThreshold}::timestamptz)
          )
        ORDER BY status ASC, image_index ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const mapped = (rows as Record<string, unknown>[]).map(
      (r) => toCamelCase(r) as unknown as InferenceJobImage,
    );
    return mapped[0];
  }

  async completeImage(
    imageId: string,
    result: {
      detections?: unknown;
      inferenceMs?: number | null;
      width?: number | null;
      height?: number | null;
    },
    attempts: number,
  ): Promise<InferenceJobImage | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(inferenceJobImages)
        .set({
          status: 'completed',
          detections: result.detections ?? null,
          inferenceMs: result.inferenceMs ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inferenceJobImages.id, imageId),
            eq(inferenceJobImages.attempts, attempts),
            eq(inferenceJobImages.status, 'running'),
          ),
        )
        .returning();

      if (updated) {
        await this.recomputeJobCounters(updated.jobId, tx);
      }
      return updated;
    });
  }

  async failImage(
    imageId: string,
    errorMessage: string,
    attempts: number,
  ): Promise<InferenceJobImage | undefined> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(inferenceJobImages)
        .set({
          status: 'failed',
          errorMessage,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inferenceJobImages.id, imageId),
            eq(inferenceJobImages.attempts, attempts),
            eq(inferenceJobImages.status, 'running'),
          ),
        )
        .returning();

      if (updated) {
        await this.recomputeJobCounters(updated.jobId, tx);
      }
      return updated;
    });
  }

  private async recomputeJobCounters(jobId: string, tx: DatabaseConnection): Promise<void> {
    const [job] = await tx
      .select({ imageCount: inferenceJobs.imageCount })
      .from(inferenceJobs)
      .where(eq(inferenceJobs.id, jobId))
      .for('update');

    const total = job?.imageCount ?? 0;

    const completedRow = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(inferenceJobImages)
      .where(and(eq(inferenceJobImages.jobId, jobId), eq(inferenceJobImages.status, 'completed')));
    const failedRow = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(inferenceJobImages)
      .where(and(eq(inferenceJobImages.jobId, jobId), eq(inferenceJobImages.status, 'failed')));

    const completed = completedRow[0]?.count ?? 0;
    const failed = failedRow[0]?.count ?? 0;

    let newStatus = 'running';
    if (total > 0 && completed + failed >= total) {
      newStatus = completed > 0 ? 'completed' : 'failed';
    }

    await tx
      .update(inferenceJobs)
      .set({
        completedCount: completed,
        failedCount: failed,
        status: newStatus,
        completedAt: newStatus === 'completed' || newStatus === 'failed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(inferenceJobs.id, jobId));
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Expiry & cleanup
  // ═══════════════════════════════════════════════════════════════════

  async findExpiredJobs(limit = 10): Promise<InferenceJob[]> {
    return this.db
      .select()
      .from(inferenceJobs)
      .where(
        and(
          sql`${inferenceJobs.expiresAt} IS NOT NULL`,
          lt(inferenceJobs.expiresAt, new Date()),
          sql`${inferenceJobs.status} IN ('uploading', 'completed', 'failed')`,
        ),
      )
      .limit(limit);
  }

  async deleteJob(id: string, audit?: { actorUserId: string }): Promise<InferenceJob | undefined> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(inferenceJobs)
        .where(eq(inferenceJobs.id, id))
        .for('update');

      if (!job || !['uploading', 'completed', 'failed'].includes(job.status)) {
        return undefined;
      }

      let keys: string[] = [];
      if (job.sourceType === 'temporary') {
        const imageRows = await tx
          .select({ sourceObjectKey: inferenceJobImages.sourceObjectKey })
          .from(inferenceJobImages)
          .where(eq(inferenceJobImages.jobId, id));
        keys = imageRows.map((r) => r.sourceObjectKey);
      }

      await tx.delete(inferenceJobs).where(eq(inferenceJobs.id, id));
      if (keys.length) {
        const runAfter = new Date(
          Date.now() + this.config.get<number>('UPLOAD_PRESIGNED_URL_TTL_SECONDS', 900) * 1000,
        );
        await tx
          .insert(objectDeletionJobs)
          .values(keys.map((objectKey) => ({ objectKey, runAfter })));
      }
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'job_delete',
          actorUserId: audit.actorUserId,
          resourceType: 'inference_job',
          resourceId: id,
          metadata: { sourceType: job.sourceType, keyCount: keys.length },
        });
      return job;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Worker helpers
  // ═══════════════════════════════════════════════════════════════════

  async listQueuedJobIds(limit = 1): Promise<string[]> {
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
    const maxAttempts = this.config.get<number>('WORKER_INFERENCE_MAX_IMAGE_ATTEMPTS', 3);
    const rows = await this.db
      .select({ id: inferenceJobs.id })
      .from(inferenceJobs)
      .innerJoin(inferenceModels, eq(inferenceJobs.modelId, inferenceModels.id))
      .where(
        and(
          sql`${inferenceJobs.status} IN ('queued', 'running')`,
          eq(inferenceModels.status, 'ready'),
          sql`${inferenceModels.deletedAt} IS NULL`,
          sql`EXISTS (
            SELECT 1 FROM ${inferenceJobImages}
            WHERE ${inferenceJobImages.jobId} = ${inferenceJobs.id}
              AND ${inferenceJobImages.attempts} < ${maxAttempts}
              AND (
                (
                  ${inferenceJobImages.status} = 'queued'
                  AND (${inferenceJobImages.retryAfter} IS NULL OR ${inferenceJobImages.retryAfter} <= NOW())
                )
                OR (
                  ${inferenceJobImages.status} = 'running'
                  AND ${inferenceJobImages.updatedAt} < ${staleThreshold}::timestamptz
                )
              )
          )`,
        ),
      )
      .orderBy(asc(inferenceJobs.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async failExhaustedImages(maxAttempts: number): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS);
    const images = await this.db
      .select({ id: inferenceJobImages.id, attempts: inferenceJobImages.attempts })
      .from(inferenceJobImages)
      .where(
        and(
          eq(inferenceJobImages.status, 'running'),
          sql`${inferenceJobImages.attempts} >= ${maxAttempts}`,
          lt(inferenceJobImages.updatedAt, staleThreshold),
        ),
      )
      .limit(20);
    for (const image of images) {
      await this.failImage(image.id, 'inference lease expired at max attempts', image.attempts);
    }
  }

  async retryImage(
    imageId: string,
    attempts: number,
    errorMessage?: string,
  ): Promise<InferenceJobImage | undefined> {
    const setData: Record<string, unknown> = {
      status: 'queued',
      retryAfter: new Date(Date.now() + IMAGE_RETRY_BACKOFF_MS),
      updatedAt: new Date(),
    };
    if (errorMessage !== undefined) setData.errorMessage = errorMessage;
    const [row] = await this.db
      .update(inferenceJobImages)
      .set(setData)
      .where(
        and(
          eq(inferenceJobImages.id, imageId),
          eq(inferenceJobImages.attempts, attempts),
          eq(inferenceJobImages.status, 'running'),
        ),
      )
      .returning();
    return row;
  }

  async markJobRunningIfNeeded(jobId: string): Promise<void> {
    await this.db
      .update(inferenceJobs)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(inferenceJobs.id, jobId), eq(inferenceJobs.status, 'queued')));
  }
}
