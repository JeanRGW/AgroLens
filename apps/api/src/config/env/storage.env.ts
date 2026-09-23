import { z } from 'zod';

/**
 * Object storage (S3 / Garage) and upload limits shape.
 */
export const storageEnvShape = {
  // S3 / Garage
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Upload limits
  UPLOAD_MAX_FILES: z.coerce.number().int().positive().default(100),
  UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024), // 100 MB
  UPLOAD_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
};
