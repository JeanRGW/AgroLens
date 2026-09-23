import { z } from 'zod';

/**
 * Internal inference service shape.
 */
export const inferenceEnvShape = {
  // Inference
  INFERENCE_SERVICE_URL: z.string().url().optional().default('http://localhost:8000'),
  INFERENCE_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  INFERENCE_MODEL_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(500 * 1024 * 1024),
  INFERENCE_TEMP_MAX_FILES: z.coerce.number().int().positive().default(20),
  INFERENCE_TEMP_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  /**
   * Deprecated alias of RETENTION_DAYS governing inference job expiry only.
   * Kept optional so existing .env/compose files validate; resolved through
   * resolveRetentionDays() and ignored once RETENTION_DAYS is set.
   */
  INFERENCE_JOB_RETENTION_DAYS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  INFERENCE_UPLOAD_EXPIRY_HOURS: z.coerce.number().int().positive().default(24),
  INFERENCE_IMAGE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  INFERENCE_PREDICT_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  IMAGE_MAX_INPUT_PIXELS: z.coerce.number().int().positive().default(40_000_000),
  INFERENCE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
};
