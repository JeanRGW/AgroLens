import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { toCamelCase } from '../database.utils';
import { uploadFinalizationJobs, objectDeletionJobs } from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export { toCamelCase };
export type UploadFinalizationJob = InferSelectModel<typeof uploadFinalizationJobs>;
export type NewUploadFinalizationJob = InferInsertModel<typeof uploadFinalizationJobs>;
export type ObjectDeletionJob = InferSelectModel<typeof objectDeletionJobs>;
export type NewObjectDeletionJob = InferInsertModel<typeof objectDeletionJobs>;

@Injectable()
export class JobsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  async claimFinalizationJob(
    workerId: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<UploadFinalizationJob | undefined> {
    await this.db.transaction(async (tx) => {
      // Snapshot reapable candidates without locking. Every candidate is then
      // processed under the standard lock order (upload row first, then the
      // job row) so finalization transactions can never invert against
      // complete/fail, which also lock the upload before the job row.
      const reaped = await tx.execute(sql`
        SELECT id, upload_id FROM upload_finalization_jobs
        WHERE status = 'running' AND attempts >= ${maxAttempts}
          AND locked_at < NOW() - (${leaseMs} * INTERVAL '1 millisecond')
        ORDER BY upload_id, id
      `);
      for (const row of reaped as unknown as Array<{ id: string; upload_id: string }>) {
        await tx.execute(sql`SELECT id FROM uploads WHERE id = ${row.upload_id} FOR UPDATE`);
        // Re-verify under lock: a concurrent worker may have reaped this job
        // first, completed it, renewed its lease, or reset its attempt count.
        const job =
          await tx.execute(sql`UPDATE upload_finalization_jobs SET status = 'dead', completed_at = NOW(),
          locked_at = NULL, locked_by = NULL, lock_token = NULL,
          last_error = COALESCE(last_error, 'lease expired at max attempts')
          WHERE id = ${row.id} AND status = 'running' AND attempts >= ${maxAttempts}
            AND locked_at < NOW() - (${leaseMs} * INTERVAL '1 millisecond')
          RETURNING id`);
        if (!job.length) continue;
        await tx.execute(sql`UPDATE uploads SET status = 'failed', error_message = COALESCE(error_message, 'finalization lease expired at max attempts'), updated_at = NOW()
          WHERE id = ${row.upload_id} AND status = 'finalizing'`);
      }
    });
    const rows = await this.db.execute(sql`
      WITH candidate AS (
        SELECT id FROM upload_finalization_jobs
        WHERE ((status = 'pending' AND (retry_after IS NULL OR retry_after <= NOW()))
          OR (status = 'running' AND locked_at < NOW() - (${leaseMs} * INTERVAL '1 millisecond')))
          AND attempts < ${maxAttempts}
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE upload_finalization_jobs AS job
      SET status = 'running', locked_at = NOW(), locked_by = ${workerId},
          lock_token = gen_random_uuid(), attempts = job.attempts + 1
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*`);
    return rows.length
      ? (toCamelCase(rows[0] as Record<string, unknown>) as UploadFinalizationJob)
      : undefined;
  }

  async claimDeletionJob(
    workerId: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<ObjectDeletionJob | undefined> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`WITH reaped AS (
        UPDATE object_deletion_jobs
        SET status = 'dead', completed_at = NOW(), locked_at = NULL, locked_by = NULL, lock_token = NULL,
            last_error = COALESCE(last_error, 'lease expired at max attempts')
        WHERE status = 'running' AND attempts >= ${maxAttempts}
          AND locked_at < NOW() - (${leaseMs} * INTERVAL '1 millisecond')
        RETURNING id
      )
      SELECT id FROM reaped`);
    });
    const rows = await this.db.execute(sql`
      WITH candidate AS (
        SELECT id FROM object_deletion_jobs
        WHERE run_after <= NOW()
          AND ((status = 'pending' AND (retry_after IS NULL OR retry_after <= NOW()))
            OR (status = 'running' AND locked_at < NOW() - (${leaseMs} * INTERVAL '1 millisecond')))
          AND attempts < ${maxAttempts}
        ORDER BY run_after, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE object_deletion_jobs AS job
      SET status = 'running', locked_at = NOW(), locked_by = ${workerId},
          lock_token = gen_random_uuid(), attempts = job.attempts + 1
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*`);
    return rows.length
      ? (toCamelCase(rows[0] as Record<string, unknown>) as ObjectDeletionJob)
      : undefined;
  }

  async touchFinalizationJob(id: string, token: string): Promise<boolean> {
    const result = await this.db
      .update(uploadFinalizationJobs)
      .set({ lockedAt: new Date() })
      .where(
        sql`${uploadFinalizationJobs.id} = ${id} AND ${uploadFinalizationJobs.status} = 'running' AND ${uploadFinalizationJobs.lockToken} = ${token}`,
      )
      .returning({ id: uploadFinalizationJobs.id });
    return result.length > 0;
  }

  async completeDeletionJob(id: string, token: string): Promise<boolean> {
    const table = objectDeletionJobs;
    const result = await this.db
      .update(table)
      .set({
        status: 'completed',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lockToken: null,
        retryAfter: null,
        lastError: null,
      })
      .where(
        sql`${table.id} = ${id} AND ${table.status} = 'running' AND ${table.lockToken} = ${token}`,
      )
      .returning({ id: table.id });
    return result.length > 0;
  }

  async failDeletionJob(
    id: string,
    token: string,
    error: string,
    maxAttempts: number,
  ): Promise<'pending' | 'dead' | 'stale'> {
    const table = objectDeletionJobs;
    const rows = await this.db.execute(sql`
      UPDATE ${table} SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'dead' ELSE 'pending' END,
        completed_at = CASE WHEN attempts >= ${maxAttempts} THEN NOW() ELSE NULL END,
        retry_after = CASE WHEN attempts >= ${maxAttempts} THEN NULL ELSE NOW() + LEAST(3600, 10 * 2 ^ GREATEST(0, attempts - 1)) * INTERVAL '1 second' END,
        locked_at = NULL, locked_by = NULL, lock_token = NULL, last_error = ${error}
      WHERE id = ${id} AND status = 'running' AND lock_token = ${token} RETURNING status`);
    return rows.length ? (rows[0] as { status: 'pending' | 'dead' }).status : 'stale';
  }

  async completeFinalizationAndUpload(
    id: string,
    uploadId: string,
    token: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const upload = await tx.execute(
        sql`SELECT id, status, deleted_at
             FROM uploads WHERE id = ${uploadId} FOR UPDATE`,
      );
      if (!upload.length)
        throw new Error(`Upload ${uploadId} not found while completing job ${id}`);
      const uploadRow = upload[0] as {
        id: string;
        status: string;
        deleted_at: Date | null;
      };
      const uploadStatus = uploadRow.status;
      if (uploadRow.deleted_at !== null || !['finalizing', 'ready'].includes(uploadStatus)) {
        throw new Error(`Upload ${uploadId} is incompatible with completion: ${uploadStatus}`);
      }
      const rows = await tx.execute(sql`UPDATE upload_finalization_jobs

        SET status = 'completed', completed_at = NOW(), locked_at = NULL, locked_by = NULL,
            lock_token = NULL, retry_after = NULL, last_error = NULL
        WHERE id = ${id} AND upload_id = ${uploadId} AND status = 'running' AND lock_token = ${token}
        RETURNING id`);
      if (!rows.length) return false;
      if (uploadStatus === 'finalizing') {
        const updated = await tx.execute(sql`UPDATE uploads
          SET status = 'ready', error_message = NULL, updated_at = NOW()
          WHERE id = ${uploadId} AND status = 'finalizing'
          RETURNING id`);
        if (updated.length !== 1) {
          throw new Error(`Upload ${uploadId} completion update affected ${updated.length} rows`);
        }
      }
      return true;
    });
  }

  async failFinalizationAndUpload(
    id: string,
    uploadId: string,
    token: string,
    error: string,
    maxAttempts: number,
  ): Promise<'pending' | 'dead' | 'stale'> {
    return this.db.transaction(async (tx) => {
      // Standard order: lock the upload before the job row (mirrors
      // completeFinalizationAndUpload and the reaper) so concurrent
      // finalization transactions cannot deadlock on inverted locks.
      const uploadRows = await tx.execute(
        sql`SELECT id FROM uploads WHERE id = ${uploadId} FOR UPDATE`,
      );
      if (!uploadRows.length)
        throw new Error(`Upload ${uploadId} not found while failing job ${id}`);
      const rows = await tx.execute(sql`UPDATE upload_finalization_jobs
        SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'dead' ELSE 'pending' END,
            completed_at = CASE WHEN attempts >= ${maxAttempts} THEN NOW() ELSE NULL END,
            retry_after = CASE WHEN attempts >= ${maxAttempts} THEN NULL ELSE NOW() + LEAST(3600, 10 * 2 ^ GREATEST(0, attempts - 1)) * INTERVAL '1 second' END,
            locked_at = NULL, locked_by = NULL, lock_token = NULL, last_error = ${error}
        WHERE id = ${id} AND upload_id = ${uploadId} AND status = 'running' AND lock_token = ${token}
        RETURNING status`);
      if (!rows.length) return 'stale';
      if ((rows[0] as { status: string }).status === 'dead') {
        await tx.execute(sql`UPDATE uploads SET status = 'failed', error_message = ${error}, updated_at = NOW()
          WHERE id = ${uploadId} AND status = 'finalizing'`);
        return 'dead';
      }
      return 'pending';
    });
  }

  /**
   * List jobs currently in the 'dead' terminal state across the two job queues
   * that the worker can actually pick back up (finalization and object deletion).
   * Sanitized error text so operators can diagnose without exposing internals.
   */
  async listDeadJobs(limit = 100): Promise<Array<Record<string, unknown>>> {
    const finalization = await this.db.execute(sql`
      SELECT 'upload_finalization' AS queue, id, upload_id, attempts, last_error, created_at
      FROM upload_finalization_jobs
      WHERE status = 'dead'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    const deletion = await this.db.execute(sql`
      SELECT 'object_deletion' AS queue, id, object_key, attempts, last_error, created_at
      FROM object_deletion_jobs
      WHERE status = 'dead'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return [
      ...(finalization as unknown as Array<Record<string, unknown>>),
      ...(deletion as unknown as Array<Record<string, unknown>>),
    ].map((row) => toCamelCase(row));
  }

  async retryDeadDeletionJob(id: string): Promise<{ found: boolean; retried: boolean }> {
    const table = objectDeletionJobs;
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT id, status FROM ${table} WHERE id = ${id} FOR UPDATE`,
      );
      const row = rows[0] as { status: string } | undefined;
      if (!row) return { found: false, retried: false };
      if (row.status !== 'dead') return { found: true, retried: false };
      await tx.execute(sql`
          UPDATE ${table}
          SET status = 'pending', attempts = 0, retry_after = NOW(),
              locked_at = NULL, locked_by = NULL, lock_token = NULL, completed_at = NULL
          WHERE id = ${id}
        `);
      return { found: true, retried: true };
    });
  }

  /**
   * Re-queue a dead upload_finalization job so it is actually processable.
   *
   * A dead finalization job leaves its upload failed. This atomically restores
   * the upload to finalizing together with the job requeue.
   *
   * Returns one of:
   *   { status: 'not_found' }              job or upload does not exist
   *   { status: 'not_dead' }               job is not in the dead state
   *   { status: 'upload_not_retryable' }   upload state moved on
   *   { status: 'active_job_exists' }      another pending/running job exists
   *   { status: 'requeued' }               upload restored and job requeued
   */
  async retryDeadFinalizationJob(
    id: string,
  ): Promise<
    | { status: 'not_found' }
    | { status: 'not_dead' }
    | { status: 'upload_not_retryable'; uploadStatus: string }
    | { status: 'active_job_exists' }
    | { status: 'requeued' }
  > {
    return this.db.transaction(async (tx) => {
      // The upload_id of a job is immutable, so it is safe to read it before
      // taking any lock (foreign key guarantees the upload row exists).
      const jobRows = await tx.execute(sql`
        SELECT upload_id FROM upload_finalization_jobs WHERE id = ${id}
      `);
      const job = jobRows[0] as { upload_id: string } | undefined;
      if (!job) return { status: 'not_found' };

      const uploadRows = await tx.execute(sql`
        SELECT status, deleted_at
        FROM uploads WHERE id = ${job.upload_id} FOR UPDATE
      `);
      if (!uploadRows.length) return { status: 'not_found' };
      const upload = uploadRows[0] as {
        status: string;
        deleted_at: Date | null;
      };

      const lockedJob = await tx.execute(sql`
        SELECT status FROM upload_finalization_jobs WHERE id = ${id} FOR UPDATE
      `);
      if ((lockedJob[0] as { status: string } | undefined)?.status !== 'dead') {
        return { status: 'not_dead' };
      }

      if (upload.deleted_at != null || upload.status !== 'failed') {
        return {
          status: 'upload_not_retryable',
          uploadStatus: upload.deleted_at != null ? 'deleted' : upload.status,
        };
      }

      // The partial unique index allows only one pending/running job per
      // upload; refuse instead of breaching it when one is already active.
      const active = await tx.execute(sql`
        SELECT id FROM upload_finalization_jobs
        WHERE upload_id = ${job.upload_id} AND id <> ${id}
          AND status IN ('pending', 'running')
      `);
      if (active.length) return { status: 'active_job_exists' };

      await tx.execute(sql`
        UPDATE uploads
        SET status = 'finalizing', error_message = NULL, updated_at = NOW()
        WHERE id = ${job.upload_id} AND status = 'failed' AND deleted_at IS NULL
      `);
      await tx.execute(sql`
        UPDATE upload_finalization_jobs
        SET status = 'pending', attempts = 0, retry_after = NOW(),
            locked_at = NULL, locked_by = NULL, lock_token = NULL, completed_at = NULL
        WHERE id = ${id}
      `);
      return { status: 'requeued' };
    });
  }
}
