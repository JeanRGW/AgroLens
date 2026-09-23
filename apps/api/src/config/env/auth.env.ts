import { z } from 'zod';

/**
 * Values used as explicit placeholders in .env.example files (CHANGE_ME_*,
 * change-me-*, replace-me-*). Rejected for secrets in production so a host
 * started from a copied example fails fast instead of shipping a public secret.
 * Exported so the config drift check can mask the same markers before
 * validating example environments.
 */
export const placeholderSecretPattern = /change[-_ ]?me|changeme|replace[-_ ]?me/i;

/**
 * Substitute schema-valid stand-ins for documented placeholder secret values
 * (CHANGE_ME_*, change-me-*) before validating example/compose environments.
 * Drift checks verify key coverage and types, not secret strength; the runtime
 * boot path never masks, so a copied .env with placeholders still fails fast.
 * The key list mirrors every production placeholder gate in envSchema.
 */
const maskedSecretKeys = [
  'JWT_SECRET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'INFERENCE_API_KEY',
  'RESEND_API_KEY',
  'SMTP_PASS',
] as const;

export function maskPlaceholderSecrets(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const masked = { ...environment };
  for (const key of maskedSecretKeys) {
    const value = masked[key];
    if (typeof value === 'string' && placeholderSecretPattern.test(value)) {
      masked[key] = 'x'.repeat(Math.max(32, value.length));
    }
  }
  return masked;
}

/**
 * Authentication, sessions, and mail shape.
 */
export const authEnvShape = {
  // JWT / Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),

  // Refresh cookie
  REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
  REFRESH_COOKIE_DOMAIN: z.string().default(''),
  REFRESH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REFRESH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Mail / password recovery
  MAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_TRANSPORT: z.enum(['resend', 'smtp', 'test']).default('smtp'),
  MAIL_FROM: z.string().default(''),
  MAIL_FROM_NAME: z.string().min(1).default('AgroLens'),
  MAIL_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  RESEND_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SMTP_HOST: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  SMTP_PASS: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
};
