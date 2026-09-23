import {
  DEFAULT_RETENTION_DAYS,
  envSchema,
  maskPlaceholderSecrets,
  resolveRetentionDays,
  resolveTrustProxy,
} from '../../src/config/env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agrolens',
  S3_ENDPOINT: 'http://localhost:3900',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  S3_BUCKET: 'agrolens',
  JWT_SECRET: 'a'.repeat(32),
};

describe('envSchema registration gating', () => {
  it('defaults REGISTRATION_ENABLED to false when omitted', () => {
    const result = envSchema.parse(validEnv);

    expect(result.REGISTRATION_ENABLED).toBe(false);
  });

  it.each([
    ['false', false],
    ['true', true],
  ] as const)('parses REGISTRATION_ENABLED=%s as %s', (value, expected) => {
    const result = envSchema.parse({ ...validEnv, REGISTRATION_ENABLED: value });

    expect(result.REGISTRATION_ENABLED).toBe(expected);
  });

  it('rejects invalid REGISTRATION_ENABLED values', () => {
    const result = envSchema.safeParse({ ...validEnv, REGISTRATION_ENABLED: 'yes' });

    expect(result.success).toBe(false);
  });

  it('requires WORKER_ID for an enabled production worker', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      WORKER_ENABLED: 'true',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://example.test',
      INFERENCE_API_KEY: 'inference-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'WORKER_ID')).toBe(true);
    }
  });

  it('defaults the dead-job threshold to one and rejects zero', () => {
    expect(envSchema.parse(validEnv).WORKER_DEAD_JOB_THRESHOLD).toBe(1);
    expect(envSchema.safeParse({ ...validEnv, WORKER_DEAD_JOB_THRESHOLD: 0 }).success).toBe(false);
  });

  it('preserves the development worker fallback when WORKER_ID is omitted', () => {
    const result = envSchema.parse({ ...validEnv, WORKER_ENABLED: 'true' });

    expect(result.WORKER_ID).toBeUndefined();
  });

  it('defaults INFERENCE_ENABLED to false when omitted', () => {
    const result = envSchema.parse(validEnv);

    expect(result.INFERENCE_ENABLED).toBe(false);
  });

  it('allows production without inference when the feature is disabled', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      INFERENCE_ENABLED: 'false',
      INFERENCE_API_KEY: '',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(true);
  });

  it('allows production without inference when INFERENCE_ENABLED is omitted', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.INFERENCE_ENABLED).toBe(false);
    }
  });

  it('requires the inference key when production inference is enabled', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      INFERENCE_ENABLED: 'true',
      INFERENCE_API_KEY: '',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'INFERENCE_API_KEY')).toBe(true);
    }
  });

  it('requires a non-placeholder S3 access key in production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      S3_ACCESS_KEY: 'CHANGE_ME_S3_APP_ACCESS_KEY',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'S3_ACCESS_KEY')).toBe(true);
    }
  });

  it('requires a non-placeholder S3 secret key in production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      S3_SECRET_KEY: 'CHANGE_ME_S3_APP_SECRET_KEY',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'S3_SECRET_KEY')).toBe(true);
    }
  });

  it('allows generated S3 credentials in production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      S3_ACCESS_KEY: 'AKIA1a2b3c4d5e6f7g8h9i0',
      S3_SECRET_KEY: 'b3a1c2d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(true);
  });

  it.each(['CHANGE_ME_INFERENCE_API_KEY', 'dev-only-inference-key-change-me'])(
    'rejects placeholder INFERENCE_API_KEY %s when production inference is enabled',
    (key) => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'production',
        INFERENCE_ENABLED: 'true',
        INFERENCE_API_KEY: key,
        REFRESH_COOKIE_SECURE: 'true',
        CORS_ORIGINS: 'https://app.agrolens.rgw.app',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === 'INFERENCE_API_KEY')).toBe(
          true,
        );
      }
    },
  );

  it('ignores a placeholder inference key when inference is disabled', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      INFERENCE_ENABLED: 'false',
      INFERENCE_API_KEY: 'CHANGE_ME_INFERENCE_API_KEY',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(true);
  });

  it('rejects placeholder mail secrets whenever mail is enabled', () => {
    const resend = envSchema.safeParse({
      ...validEnv,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'resend',
      MAIL_FROM: 'no-reply@example.com',
      RESEND_API_KEY: 'CHANGE_ME_RESEND_API_KEY',
    });
    expect(resend.success).toBe(false);
    if (!resend.success) {
      expect(resend.error.issues.some((issue) => issue.path[0] === 'RESEND_API_KEY')).toBe(true);
    }

    const smtp = envSchema.safeParse({
      ...validEnv,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASS: 'change-me-smtp-password',
    });
    expect(smtp.success).toBe(false);
    if (!smtp.success) {
      expect(smtp.error.issues.some((issue) => issue.path[0] === 'SMTP_PASS')).toBe(true);
    }
  });

  it('accepts a placeholder SMTP pass when mail is disabled', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MAIL_ENABLED: 'false',
      SMTP_HOST: '',
      SMTP_PASS: 'change-me-smtp-password',
    });

    expect(result.success).toBe(true);
  });
});

describe('envSchema mail gating', () => {
  const productionBase = {
    ...validEnv,
    NODE_ENV: 'production',
    REFRESH_COOKIE_SECURE: 'true',
    CORS_ORIGINS: 'https://app.agrolens.rgw.app',
  };

  it('defaults MAIL_ENABLED to false', () => {
    expect(envSchema.parse(validEnv).MAIL_ENABLED).toBe(false);
  });

  it('accepts a bare config with mail disabled', () => {
    const result = envSchema.safeParse(productionBase);

    expect(result.success).toBe(true);
  });

  it('requires RESEND_API_KEY when resend transport is enabled', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'resend',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'RESEND_API_KEY')).toBe(true);
    }
  });

  it('requires SMTP_HOST when smtp transport is enabled', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'SMTP_HOST')).toBe(true);
    }
  });

  it('validates MAIL_FROM when mail is enabled', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'not-an-email',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'MAIL_FROM')).toBe(true);
    }
  });

  it('forbids the test transport in production', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'test',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'MAIL_TRANSPORT')).toBe(true);
    }
  });

  it('accepts the test transport outside production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MAIL_ENABLED: 'true',
      MAIL_TRANSPORT: 'test',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(result.success).toBe(true);
  });

  it('treats empty transport keys as unset', () => {
    const onResult = envSchema.safeParse({
      ...validEnv,
      MAIL_ENABLED: 'false',
      RESEND_API_KEY: '',
      SMTP_HOST: '',
    });

    expect(onResult.success).toBe(true);
  });
});

describe('envSchema JWT secret placeholder gating', () => {
  it.each([
    'CHANGE_ME_JWT_SECRET_AT_LEAST_32_CHARS',
    'change-me-to-a-random-secret-at-least-32-chars',
  ])('rejects placeholder JWT_SECRET %s in production', (placeholder) => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      JWT_SECRET: placeholder,
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'JWT_SECRET')).toBe(true);
    }
  });

  it('accepts the documented development placeholder outside production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      JWT_SECRET: 'change-me-to-a-random-secret-at-least-32-chars',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a generated-style hex secret in production', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'b3a1c2d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef',
      REFRESH_COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://app.agrolens.rgw.app',
    });

    expect(result.success).toBe(true);
  });
});

describe('RETENTION_DAYS', () => {
  it('is unset by default so the legacy variable can be resolved', () => {
    const result = envSchema.parse(validEnv);

    expect(result.RETENTION_DAYS).toBeUndefined();
    expect(result.INFERENCE_JOB_RETENTION_DAYS).toBeUndefined();
  });

  it.each([
    ['7', 7],
    ['30', 30],
  ])('parses RETENTION_DAYS=%s as %s', (value, expected) => {
    expect(envSchema.parse({ ...validEnv, RETENTION_DAYS: value }).RETENTION_DAYS).toBe(expected);
  });

  it('treats an empty value as unset for compose passthrough', () => {
    expect(envSchema.parse({ ...validEnv, RETENTION_DAYS: '' }).RETENTION_DAYS).toBeUndefined();
    expect(
      envSchema.parse({ ...validEnv, INFERENCE_JOB_RETENTION_DAYS: '' })
        .INFERENCE_JOB_RETENTION_DAYS,
    ).toBeUndefined();
  });

  it('rejects zero and negative values', () => {
    expect(envSchema.safeParse({ ...validEnv, RETENTION_DAYS: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...validEnv, RETENTION_DAYS: '-1' }).success).toBe(false);
    expect(envSchema.safeParse({ ...validEnv, RETENTION_DAYS: '1.5' }).success).toBe(false);
  });
});

describe('resolveRetentionDays', () => {
  it('prefers RETENTION_DAYS over the deprecated alias', () => {
    expect(resolveRetentionDays(3, 9)).toBe(3);
  });

  it('falls back to the deprecated alias, then the default', () => {
    expect(resolveRetentionDays(undefined, 9)).toBe(9);
    expect(resolveRetentionDays(undefined, undefined)).toBe(DEFAULT_RETENTION_DAYS);
  });
});

describe('TRUST_PROXY', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['2', 2],
  ])('parses TRUST_PROXY=%s via resolveTrustProxy', (value, expected) => {
    expect(resolveTrustProxy(value)).toBe(expected);
  });

  it('falls back to one trusted hop when unset', () => {
    expect(resolveTrustProxy(undefined)).toBe(1);
  });

  it('treats an empty value as unset for compose passthrough', () => {
    const result = envSchema.parse({ ...validEnv, TRUST_PROXY: '' });
    expect(result.TRUST_PROXY).toBeUndefined();
  });

  it('is unset by default', () => {
    expect(envSchema.parse(validEnv).TRUST_PROXY).toBeUndefined();
  });

  it.each(['yes', '0x1', '-1', '1.5', 'admin,proxy'])('rejects invalid TRUST_PROXY=%s', (value) => {
    expect(envSchema.safeParse({ ...validEnv, TRUST_PROXY: value }).success).toBe(false);
  });
});

describe('maskPlaceholderSecrets', () => {
  it.each([
    'CHANGE_ME_JWT_SECRET_AT_LEAST_32_CHARS',
    'change-me-to-a-random-secret-at-least-32-chars',
  ])('masks the placeholder JWT_SECRET %s', (placeholder) => {
    const result = maskPlaceholderSecrets({ JWT_SECRET: placeholder });

    expect(result.JWT_SECRET).toBe('x'.repeat(placeholder.length));
  });

  it.each(['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'INFERENCE_API_KEY', 'RESEND_API_KEY', 'SMTP_PASS'])(
    'masks a placeholder %s so example environments stay schema-valid',
    (key) => {
      const placeholder = 'CHANGE_ME_EXAMPLE_PLACEHOLDER_KEY'; // 32 chars
      const result = maskPlaceholderSecrets({ [key]: placeholder });

      expect(result[key]).toBe('x'.repeat(placeholder.length));
    },
  );

  it('masks a short placeholder JWT_SECRET up to the 32-character minimum', () => {
    expect(maskPlaceholderSecrets({ JWT_SECRET: 'change-me' }).JWT_SECRET).toBe('x'.repeat(32));
  });

  it('leaves a generated-style secret untouched', () => {
    const secret = 'b3a1c2d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef';

    expect(maskPlaceholderSecrets({ JWT_SECRET: secret }).JWT_SECRET).toBe(secret);
  });

  it('preserves all other keys and does not mutate the input', () => {
    const environment = {
      JWT_SECRET: 'CHANGE_ME_JWT_SECRET_AT_LEAST_32_CHARS',
      DATABASE_URL: 'postgresql://postgres:postgres@postgres:5432/agrolens',
      NODE_ENV: 'production',
    };

    const result = maskPlaceholderSecrets(environment);

    expect(result.DATABASE_URL).toBe(environment.DATABASE_URL);
    expect(result.NODE_ENV).toBe('production');
    expect(environment.JWT_SECRET).toBe('CHANGE_ME_JWT_SECRET_AT_LEAST_32_CHARS');
  });

  it('works when JWT_SECRET is absent', () => {
    expect(maskPlaceholderSecrets({ DATABASE_URL: 'postgresql://x' }).JWT_SECRET).toBeUndefined();
  });
});
