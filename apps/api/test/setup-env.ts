// Set required environment variables before any NestJS module is loaded.
// ConfigModule.forRoot() runs validate() eagerly at module-definition time.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/agrolens_test';
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:3900';
process.env.S3_REGION = process.env.S3_REGION ?? 'garage';
process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'agrolens-dev-access-key';
process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'agrolens-dev-secret-key-change-me';
process.env.S3_BUCKET = process.env.S3_BUCKET ?? 'agrolens';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-jwt-secret-key-at-least-32-characters-long';
process.env.UPLOAD_MAX_FILES = process.env.UPLOAD_MAX_FILES ?? '100';
process.env.UPLOAD_MAX_FILE_SIZE_BYTES = process.env.UPLOAD_MAX_FILE_SIZE_BYTES ?? '104857600';
process.env.UPLOAD_PRESIGNED_URL_TTL_SECONDS =
  process.env.UPLOAD_PRESIGNED_URL_TTL_SECONDS ?? '900';
process.env.WORKER_ENABLED = process.env.WORKER_ENABLED ?? 'false';
process.env.WORKER_POLL_INTERVAL_MS = process.env.WORKER_POLL_INTERVAL_MS ?? '5000';
process.env.WORKER_FINALIZATION_MAX_ATTEMPTS = process.env.WORKER_FINALIZATION_MAX_ATTEMPTS ?? '3';
// Mail is enabled with the in-memory test transport so password-recovery e2e
// can assert on captured messages (MAIL_TRANSPORT=test is forbidden only in
// production, which e2e is not).
process.env.MAIL_ENABLED = process.env.MAIL_ENABLED ?? 'true';
process.env.MAIL_TRANSPORT = process.env.MAIL_TRANSPORT ?? 'test';
process.env.MAIL_FROM = process.env.MAIL_FROM ?? 'no-reply@example.com';
