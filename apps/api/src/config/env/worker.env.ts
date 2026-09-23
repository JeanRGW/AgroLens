import { z } from 'zod';

export const DEFAULT_RETENTION_DAYS = 7;

/**
 * Resolve the canonical data-retention window (days) that governs worker
 * pruning of refresh tokens, terminal jobs, audit events,
 * and inference job expiry. RETENTION_DAYS wins; the deprecated
 * INFERENCE_JOB_RETENTION_DAYS is honored only while it is unset so existing
 * deployments keep their configured window across the rename.
 */
export function resolveRetentionDays(
  retentionDays: number | undefined,
  legacyInferenceJobRetentionDays: number | undefined,
): number {
  return retentionDays ?? legacyInferenceJobRetentionDays ?? DEFAULT_RETENTION_DAYS;
}

/**
 * Background worker shape.
 */
export const workerEnvShape = {
  // Canonical data-retention window for worker pruning of transient records
  // (refresh tokens, terminal jobs, audit events).
  // Empty (unset compose interpolation) falls back to the documented default.
  RETENTION_DAYS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),

  // Worker
  WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_LEASE_MS: z.coerce.number().int().positive().default(120000),
  WORKER_ID: z.string().min(1).optional(),
  WORKER_FINALIZATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  WORKER_DELETION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  WORKER_INFERENCE_MAX_IMAGE_ATTEMPTS: z.coerce.number().int().positive().default(3),
  WORKER_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(60000),

  WORKER_QUEUE_AGE_THRESHOLD_MS: z.coerce.number().int().positive().default(900000),
  WORKER_DEAD_JOB_THRESHOLD: z.coerce.number().int().min(1).default(1),
  WORKER_FINALIZATION_CONCURRENCY: z.coerce.number().int().positive().max(10).default(1),
  WORKER_DELETION_CONCURRENCY: z.coerce.number().int().positive().max(10).default(1),
  WORKER_INFERENCE_CONCURRENCY: z.coerce.number().int().positive().max(10).default(1),
};
