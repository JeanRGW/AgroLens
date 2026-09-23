import { z } from 'zod';

/**
 * Application runtime shape: process, HTTP, proxy, CORS, throttling, database.
 */
export const appEnvShape = {
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().min(1).default('api'),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REGISTRATION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CLEANUP_DRAFT_EXPIRY_HOURS: z.coerce.number().int().positive().default(24),
  CLEANUP_FAILED_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://', {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  }),

  // Reverse-proxy hops whose X-Forwarded-* headers the API may trust.
  // "false" | "true" | positive hop count; unset trusts one hop (host Caddy).
  TRUST_PROXY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^(true|false|\d+)$/, 'TRUST_PROXY must be true, false, or a hop count')
      .optional(),
  ),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  // Rate limiting (@nestjs/throttler, per-endpoint IP buckets).
  // Empty (unset compose interpolation) falls back to the documented default.
  THROTTLE_DEFAULT_LIMIT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(120),
  ),
  THROTTLE_DEFAULT_TTL_MS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(60000),
  ),
  THROTTLE_AUTH_LIMIT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(10),
  ),
  THROTTLE_AUTH_TTL_MS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(60000),
  ),
};

/**
 * Default value of TRUST_PROXY. The API sits behind exactly one reverse-proxy
 * hop (host Caddy), which overwrites X-Forwarded-* headers; trusting one hop
 * keeps Express's req.ip on the real client while never trusting values a
 * client could forge. Override only when the topology genuinely differs.
 */
export const TRUST_PROXY_DEFAULT = 1;

/**
 * Parse the TRUST_PROXY environment variable into the value accepted by
 * Express's "trust proxy" setting. "false"/"true" become booleans, numeric
 * strings become hop counts, and other values are rejected by the schema so
 * typos fail fast instead of silently trusting every hop.
 */
export function resolveTrustProxy(value: string | undefined): boolean | number {
  if (value === undefined) return TRUST_PROXY_DEFAULT;
  if (value === 'false') return false;
  if (value === 'true') return true;
  return Number(value);
}
