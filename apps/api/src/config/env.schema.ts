import { z } from 'zod';

import { appEnvShape, TRUST_PROXY_DEFAULT, resolveTrustProxy } from './env/app.env';
import { storageEnvShape } from './env/storage.env';
import { authEnvShape, maskPlaceholderSecrets, placeholderSecretPattern } from './env/auth.env';
import { workerEnvShape, DEFAULT_RETENTION_DAYS, resolveRetentionDays } from './env/worker.env';
import { inferenceEnvShape } from './env/inference.env';

export {
  appEnvShape,
  storageEnvShape,
  authEnvShape,
  workerEnvShape,
  inferenceEnvShape,
  placeholderSecretPattern,
  maskPlaceholderSecrets,
  TRUST_PROXY_DEFAULT,
  resolveTrustProxy,
  DEFAULT_RETENTION_DAYS,
  resolveRetentionDays,
};

/**
 * Zod schema for environment variable validation.
 * Validated at application startup; the app refuses to start with invalid config.
 * Domain shapes live in ./env/* and are composed here; production cross-checks
 * below apply to the merged schema.
 */
export const envSchemaShape = z.object({
  ...appEnvShape,
  ...storageEnvShape,
  ...authEnvShape,
  ...workerEnvShape,
  ...inferenceEnvShape,
});

export const envSchema = envSchemaShape.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && placeholderSecretPattern.test(env.JWT_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message:
        'JWT_SECRET must not be a placeholder value in production (generate with: openssl rand -hex 32)',
    });
  }
  // S3 credentials live in the backend environment and create the Garage key;
  // a placeholder there leaves the bucket reachable with a published secret.
  for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
    if (env.NODE_ENV === 'production' && placeholderSecretPattern.test(env[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must not be a placeholder value in production (generate with: openssl rand -hex 24)`,
      });
    }
  }
  // An inference deployment shipping the documented placeholder key would
  // accept unauthenticated predict/model requests from anything that reaches it.
  if (
    env.NODE_ENV === 'production' &&
    env.INFERENCE_ENABLED &&
    env.INFERENCE_API_KEY &&
    placeholderSecretPattern.test(env.INFERENCE_API_KEY)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INFERENCE_API_KEY'],
      message:
        'INFERENCE_API_KEY must not be a placeholder value in production (generate with: openssl rand -hex 32)',
    });
  }
  if (env.NODE_ENV === 'production' && !env.REFRESH_COOKIE_SECURE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REFRESH_COOKIE_SECURE'],
      message: 'REFRESH_COOKIE_SECURE must be true in production',
    });
  }
  if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT === 'test') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MAIL_TRANSPORT'],
      message: 'MAIL_TRANSPORT=test is only allowed outside production',
    });
  }
  if (env.MAIL_ENABLED) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.MAIL_FROM)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_FROM'],
        message: 'MAIL_FROM must be a valid sender email when mail is enabled',
      });
    }
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when MAIL_TRANSPORT=resend',
      });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_TRANSPORT=smtp',
      });
    }
    // Mail secrets are sent to third-party providers; a placeholder value must
    // never reach the network, in any environment where mail actually fires.
    const mailSecret = env.MAIL_TRANSPORT === 'resend' ? env.RESEND_API_KEY : env.SMTP_PASS;
    if (mailSecret && placeholderSecretPattern.test(mailSecret)) {
      const path = env.MAIL_TRANSPORT === 'resend' ? 'RESEND_API_KEY' : 'SMTP_PASS';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `${path} must not be a placeholder value when mail is enabled`,
      });
    }
  }
  if (env.NODE_ENV === 'production' && env.INFERENCE_ENABLED && !env.INFERENCE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INFERENCE_API_KEY'],
      message: 'INFERENCE_API_KEY is required in production',
    });
  }
  if (env.NODE_ENV === 'production' && env.WORKER_ENABLED && !env.WORKER_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WORKER_ID'],
      message: 'WORKER_ID is required when the production worker is enabled',
    });
  }
  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS must contain at least one origin in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;
