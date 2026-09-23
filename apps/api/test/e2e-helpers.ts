/**
 * Reusable helpers for real-service E2E tests.
 *
 * These helpers:
 *   - Create a test NestJS application (same as health.e2e-spec.ts pattern)
 *   - Clean/reset the database between test runs (DELETE FROM in dep order)
 *   - Register, login, and promote users
 *   - Create catalog entries via HTTP
 *   - Generate valid image fixtures (minimal valid PNG)
 *   - Upload bytes to a presigned S3 URL
 *   - Directly invoke FinalizationService to process jobs (bypass worker loop)
 *   - Ensure the S3 test bucket exists
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { S3Client, CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { sql, eq } from 'drizzle-orm';

import { DATABASE_CONNECTION, type DatabaseConnection } from '../src/database/database.constants';
import { FinalizationService } from '../src/worker/finalization.service';
import { AuditRepository } from '../src/database/repositories';
import { users as usersTable } from '../src/database/schema';

// ── Shared test user type ──────────────────────────────────────────────

export interface TestUser {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  accessToken: string;
}

// ── NestJS app creation ────────────────────────────────────────────────

/**
 * Create and initialize a NestJS application for E2E tests.
 * Uses the same pattern as health.e2e-spec.ts.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');

  // Swagger setup (mirrors main.ts, same as health.e2e-spec.ts)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AgroLens API')
    .setDescription('E2E Test API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.init();
  return app;
}

// ── Database cleanup ───────────────────────────────────────────────────

/**
 * Table names in dependency order (children before parents so DELETEs succeed
 * even without CASCADE if needed, though FK CASCADE is set up).
 */
const ALL_TABLES = [
  'access_grants',
  'object_deletion_jobs',
  'upload_finalization_jobs',
  'image_annotations',
  'audit_events',
  'upload_files',
  'uploads',
  'estadios',
  'crop_types',
  'talhoes',
  'properties',
  'refresh_tokens',
  'password_reset_tokens',
  'users',
] as const;

/**
 * Delete all rows from all application tables (in dependency-safe order).
 * Uses a single TRUNCATE with CASCADE for speed and correctness.
 */
export async function cleanDatabase(app: INestApplication): Promise<void> {
  const db: DatabaseConnection = app.get(DATABASE_CONNECTION);

  const tableList = ALL_TABLES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
}

// ── Auth helpers ───────────────────────────────────────────────────────

/**
 * Register a new user via POST /api/auth/register and return their tokens.
 * Uses clientType: 'mobile' so the refresh token comes back in the body (no cookie needed).
 */
export async function registerUser(
  app: INestApplication,
  email: string,
  password: string,
  fullName: string,
): Promise<TestUser> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password, fullName, clientType: 'mobile' })
    .expect(201);

  const body = res.body as {
    user: { id: string; email: string; fullName: string; role: string };
    accessToken: string;
    refreshToken: string;
  };

  return {
    userId: body.user.id,
    email,
    password,
    fullName,
    accessToken: body.accessToken,
  };
}

/**
 * Login via POST /api/auth/login and return tokens.
 */
export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, clientType: 'mobile' })
    .expect(200);

  const body = res.body as { accessToken: string; refreshToken: string };
  return body;
}

/**
 * Promote a user to admin role by directly updating the database.
 * Also writes an audit event for the role change.
 */
export async function promoteToAdmin(app: INestApplication, userId: string): Promise<void> {
  const db: DatabaseConnection = app.get(DATABASE_CONNECTION);
  await db
    .update(usersTable)
    .set({ role: 'admin', updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  const auditRepo: AuditRepository = app.get(AuditRepository);
  await auditRepo.create({
    eventType: 'role_change',
    targetUserId: userId,
    metadata: { newRole: 'admin' },
  });
}

// ── Catalog helpers ────────────────────────────────────────────────────

export async function createProperty(
  app: INestApplication,
  accessToken: string,
  data: {
    name: string;
    owner: string;
    address: string;
    latitude: number;
    longitude: number;
  },
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/properties')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(data)
    .expect(201);

  return (res.body as { property: { id: string } }).property.id;
}

export async function createTalhao(
  app: INestApplication,
  accessToken: string,
  name: string,
  propertyId: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/talhoes')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, propertyId })
    .expect(201);

  return (res.body as { talhao: { id: string } }).talhao.id;
}

export async function createCropType(
  app: INestApplication,
  accessToken: string,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/crop-types')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);

  return (res.body as { cropType: { id: string } }).cropType.id;
}

export async function createEstadio(
  app: INestApplication,
  accessToken: string,
  name: string,
  cropTypeId: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/estadios')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, cropTypeId })
    .expect(201);

  return (res.body as { estadio: { id: string } }).estadio.id;
}

// ── Image fixture ──────────────────────────────────────────────────────

/**
 * A minimal valid 2×2 red PNG encoded as base64.
 * Generated with: sharp({ create: { width: 2, height: 2, channels: 3,
 *   background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
 */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==';

/**
 * Return a small valid PNG image buffer for upload testing.
 * The image is a 2×2 red PNG that Sharp can decode and probe.
 */
export function generateTestImageBuffer(): Buffer {
  return Buffer.from(MINIMAL_PNG_BASE64, 'base64');
}

// ── Upload helpers ─────────────────────────────────────────────────────

/**
 * Upload raw bytes to a presigned S3 PUT URL.
 * This simulates what a mobile/web client does after receiving presigned URLs.
 *
 * Throws if the upload fails (non-2xx status).
 */
export async function uploadBytesToPresignedUrl(
  presignedUrl: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      // Content-Length is set automatically by fetch for Buffer bodies
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Presigned PUT failed with status ${res.status}: ${text.slice(0, 500)}`);
  }
}

/**
 * Directly invoke the FinalizationService to process one finalization job.
 * This bypasses the worker poll loop for deterministic test flow.
 *
 * Returns true if a job was processed, false if no pending job exists.
 */
export async function processFinalizationJob(app: INestApplication): Promise<boolean> {
  const finalizationService: FinalizationService = app.get(FinalizationService);
  return finalizationService.processNextJob();
}

// ── Bucket setup ───────────────────────────────────────────────────────

/**
 * Ensure the configured S3 bucket exists for testing.
 * Creates it if it does not already exist (idempotent).
 */
export async function ensureTestBucket(app: INestApplication): Promise<void> {
  const configService: ConfigService = app.get(ConfigService);
  const endpoint = configService.getOrThrow<string>('S3_ENDPOINT');
  const region = configService.getOrThrow<string>('S3_REGION');
  const accessKeyId = configService.getOrThrow<string>('S3_ACCESS_KEY');
  const secretAccessKey = configService.getOrThrow<string>('S3_SECRET_KEY');
  const bucket = configService.getOrThrow<string>('S3_BUCKET');
  const forcePathStyle = configService.get<boolean>('S3_FORCE_PATH_STYLE', true);

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Check if bucket already exists
  const { Buckets } = await client.send(new ListBucketsCommand({}));
  const exists = Buckets?.some((b) => b.Name === bucket);

  if (!exists) {
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
      }),
    );
  }

  client.destroy();
}
