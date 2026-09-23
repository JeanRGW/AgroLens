import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { sanitizeError } from '../../common/sanitize-error';

@Injectable()
export class WorkerObservabilityRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  /**
   * Aggregate worker queue health.
   *
   * @param ageThresholdMs Queue age (ms) after which the oldest pending job is unhealthy.
   * @param deadThreshold  Dead-job count at which a queue is unhealthy.
   */
  async getHealth(ageThresholdMs: number, deadThreshold: number) {
    const queues = await this.db.execute(sql`
      WITH queues AS (
         SELECT 'upload_finalization' AS queue, status, attempts, created_at, last_error,
           CASE WHEN status = 'pending' THEN GREATEST(created_at, retry_after) END AS eligible_at
         FROM upload_finalization_jobs
         UNION ALL SELECT 'object_deletion', status, attempts, created_at, last_error,
           CASE WHEN status = 'pending' THEN GREATEST(created_at, run_after, retry_after) END
         FROM object_deletion_jobs
         UNION ALL SELECT 'model_validation', CASE WHEN status = 'validating' THEN 'pending' ELSE status END,
           validation_attempts, created_at, error_message,
           CASE WHEN status = 'validating' THEN
             CASE WHEN validation_attempts = 0 THEN created_at ELSE updated_at + INTERVAL '10 minutes' END
           END
         FROM inference_models
         WHERE deleted_at IS NULL AND status IN ('uploading', 'validating', 'invalid')
         UNION ALL SELECT 'inference_image', image.status, image.attempts, image.created_at, image.error_message,
           CASE WHEN image.status = 'queued' AND job.status IN ('queued', 'running')
             THEN GREATEST(image.created_at, image.retry_after) END
         FROM inference_job_images image JOIN inference_jobs job ON job.id = image.job_id
      ), summary AS (
        SELECT queue,
          COUNT(*) FILTER (WHERE status IN ('pending','queued','uploading','validating','running'))::int AS depth,
          COUNT(*) FILTER (WHERE status = 'dead' OR status = 'invalid' OR status = 'failed')::int AS dead_count,
          COALESCE(MAX(attempts), 0)::int AS max_attempts,
           EXTRACT(EPOCH FROM (NOW() - MIN(eligible_at) FILTER (WHERE eligible_at <= NOW()))) * 1000 AS oldest_pending_age_ms,
          (array_agg(last_error ORDER BY created_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
        FROM queues GROUP BY queue
      ) SELECT queue, depth, dead_count, max_attempts,
        COALESCE(oldest_pending_age_ms, 0)::bigint AS oldest_pending_age_ms,
        CASE WHEN last_error IS NULL THEN NULL ELSE LEFT(last_error, 200) END AS last_error
      FROM summary ORDER BY queue
    `);
    const queueRows: Array<Record<string, unknown>> = (
      queues as unknown as Array<Record<string, unknown>>
    ).map((row) => ({
      ...row,
      last_error: sanitizeError(row.last_error),
    }));
    const unhealthy = queueRows.some(
      (row) =>
        Number(row.oldest_pending_age_ms) > ageThresholdMs ||
        Number(row.dead_count) >= deadThreshold,
    );
    return { status: unhealthy ? 'unhealthy' : 'ok', queues: queueRows };
  }
}
