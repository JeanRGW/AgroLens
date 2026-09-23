/**
 * Real-service E2E spec covering the complete upload flow.
 *
 * Prerequisites (started by docker compose up -d):
 *   - PostgreSQL on localhost:5432 (database: agrolens_test, schema migrated)
 *   - Garage on localhost:3900
 *
 * The test flow:
 *   1. Owner registers and creates catalog entries
 *   2. Upload is initialized (POST /api/uploads/init)
 *   3. Real image bytes are PUT to the presigned URL
 *   4. Upload is completed (POST /api/uploads/:id/complete)
 *   5. Finalization is processed directly (FinalizationService, bypassing worker loop)
 *   6. Upload appears in list/detail for the owner
 *   7. Unrelated user cannot see the upload detail
 *   8. Owner can get a signed download URL
 *   9. Admin can see the download audit event
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../src/database/database.constants';
import { objectDeletionJobs, uploadFinalizationJobs } from '../../src/database/schema';
import { RetentionRepository } from '../../src/database/repositories/retention.repository';
import { StorageService } from '../../src/storage/storage.service';
import { deriveUploadObjectKeys } from '../../src/database/database.utils';
import {
  createTestApp,
  cleanDatabase,
  registerUser,
  loginUser,
  createProperty,
  createTalhao,
  createCropType,
  createEstadio,
  generateTestImageBuffer,
  uploadBytesToPresignedUrl,
  processFinalizationJob,
  promoteToAdmin,
  ensureTestBucket,
} from '../e2e-helpers';

describe('Upload flow E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();

    // Ensure the configured S3 bucket exists (no-op if already created)
    try {
      await ensureTestBucket(app);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // If Garage is not available, log but continue — individual tests will fail
      // with clearer messages.
      console.warn(`[e2e] Could not ensure test bucket: ${message}`);
    }
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  }, 15_000);

  // ──────────────────────────────────────────────────────────────────────
  // Full happy-path upload flow
  // ──────────────────────────────────────────────────────────────────────

  it('completes the full upload flow (register → catalog → init → upload → complete → finalize → list → detail → download → audit)', async () => {
    // ── Step 1: Register owner ──────────────────────────────────────────
    const owner = await registerUser(app, 'owner@example.com', 'password123', 'Owner User');

    // ── Step 2: Create catalogs ─────────────────────────────────────────
    const propertyId = await createProperty(app, owner.accessToken, {
      name: 'Fazenda Teste',
      owner: 'Owner User',
      address: 'Rua Teste, 123',
      latitude: -22.9,
      longitude: -43.1,
    });
    expect(propertyId).toBeDefined();

    const talhaoId = await createTalhao(app, owner.accessToken, 'Talhao Norte', propertyId);
    expect(talhaoId).toBeDefined();

    const cropTypeId = await createCropType(app, owner.accessToken, 'Soja');
    expect(cropTypeId).toBeDefined();

    const estadioId = await createEstadio(app, owner.accessToken, 'Vegetativo', cropTypeId);
    expect(estadioId).toBeDefined();

    // ── Step 3: Init upload ─────────────────────────────────────────────
    const imageBuffer = generateTestImageBuffer();
    const clientUploadId = 'test-client-id-001';
    const initResponse = await request(app.getHttpServer())
      .post('/api/uploads/init')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        clientUploadId,
        propertyId,
        talhaoId,
        cropTypeId,
        estadioId,
        source: 'phone',
        activityDate: new Date().toISOString(),
        latitude: -22.9,
        longitude: -43.1,
        files: [
          {
            imageIndex: 0,
            contentType: 'image/png',
            fileName: 'test-image.png',
            sizeBytes: imageBuffer.length,
          },
        ],
      })
      .expect(201);

    const initBody = initResponse.body as {
      uploadId: string;
      status: string;
      files: Array<{
        imageIndex: number;
        fileId: string;
        uploadUrl: string;
        objectKey: string;
        method: string;
        headers: Record<string, string>;
        expiresAt: string;
      }>;
    };
    const uploadId = initBody.uploadId;
    expect(uploadId).toBeDefined();
    expect(initBody.status).toBe('draft');
    expect(initBody.files).toHaveLength(1);

    const fileInstruction = initBody.files[0];
    expect(fileInstruction.method).toBe('PUT');
    expect(fileInstruction.uploadUrl).toBeTruthy();

    // ── Step 4: Upload image bytes to presigned URL ─────────────────────
    await uploadBytesToPresignedUrl(fileInstruction.uploadUrl, imageBuffer, 'image/png');
    // No explicit assertion — if uploadBytesToPresignedUrl didn't throw, it succeeded.

    // ── Step 5: Complete upload ─────────────────────────────────────────
    const completeResponse = await request(app.getHttpServer())
      .post(`/api/uploads/${uploadId}/complete`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const completeBody = completeResponse.body as {
      upload: { id: string; status: string };
    };
    expect(completeBody.upload.status).toBe('finalizing');

    // ── Step 6: Process finalization directly (bypasses worker loop) ────
    const processed = await processFinalizationJob(app);
    expect(processed).toBe(true);

    // ── Step 7: List uploads (should appear as ready) ───────────────────
    const listResponse = await request(app.getHttpServer())
      .get('/api/uploads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const listBody = listResponse.body as {
      uploads: Array<{
        id: string;
        status: string;
        source: string;
        activityDate: string;
        latitude: number;
        longitude: number;
        createdAt: string;
        updatedAt: string;
        fileCount: number;
      }>;
      total: number;
    };
    expect(listBody.total).toBe(1);
    expect(listBody.uploads[0].id).toBe(uploadId);
    expect(listBody.uploads[0].status).toBe('ready');
    expect(listBody.uploads[0].fileCount).toBe(1);

    // ── Step 8: Upload detail (owner can see) ───────────────────────────
    const detailResponse = await request(app.getHttpServer())
      .get(`/api/uploads/${uploadId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const detailBody = detailResponse.body as {
      id: string;
      status: string;
      files: Array<{
        id: string;
        imageIndex: number;
        variant: string;
        objectKey: string;
        contentType: string;
      }>;
    };
    expect(detailBody.id).toBe(uploadId);
    expect(detailBody.status).toBe('ready');
    expect(detailBody.files).toHaveLength(2); // original + preview
    const previewFile = detailBody.files.find((f) => f.variant === 'preview');
    expect(previewFile).toBeDefined();
    expect(previewFile!.contentType).toBe('image/jpeg');
    const originalFile = detailBody.files.find((f) => f.variant === 'original');
    expect(originalFile).toBeDefined();
    expect(originalFile!.contentType).toBe('image/png');
    expect(fileInstruction.objectKey).toBe(`staging/${originalFile!.objectKey}`);

    // Replaying the still-valid PUT may replace staging bytes, never the ready original.
    await uploadBytesToPresignedUrl(
      fileInstruction.uploadUrl,
      Buffer.from('replacement'),
      'image/png',
    );
    const deletionJobs = await app
      .get<DatabaseConnection>(DATABASE_CONNECTION)
      .select()
      .from(objectDeletionJobs)
      .where(eq(objectDeletionJobs.uploadId, uploadId));
    expect(deletionJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectKey: fileInstruction.objectKey,
          runAfter: expect.any(Date),
        }),
      ]),
    );
    expect(
      deletionJobs.find((job) => job.objectKey === fileInstruction.objectKey)!.runAfter.getTime(),
    ).toBeGreaterThanOrEqual(new Date(fileInstruction.expiresAt).getTime());

    // ── Step 9: Unrelated user cannot see detail ────────────────────────
    const otherUser = await registerUser(app, 'other@example.com', 'password456', 'Other User');

    await request(app.getHttpServer())
      .get(`/api/uploads/${uploadId}`)
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .expect(404);

    // ── Step 10: Owner can get download URL ─────────────────────────────
    const downloadResponse = await request(app.getHttpServer())
      .get(`/api/uploads/${uploadId}/files/${originalFile!.id}/download-url`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const downloadBody = downloadResponse.body as {
      uploadId: string;
      fileId: string;
      downloadUrl: string;
      expiresAt: string;
      contentType: string;
    };
    expect(downloadBody.downloadUrl).toBeTruthy();
    expect(downloadBody.downloadUrl).toContain('X-Amz-Signature');
    const downloaded = await fetch(downloadBody.downloadUrl);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(imageBuffer);

    // ── Step 11: Admin audit check ──────────────────────────────────────
    // Promote owner to admin, login again, and check audit events.
    await promoteToAdmin(app, owner.userId);
    const adminTokens = await loginUser(app, owner.email, owner.password);

    const auditResponse = await request(app.getHttpServer())
      .get('/api/audit-events')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    const auditBody = auditResponse.body as {
      items: Array<{
        id: string;
        eventType: string;
        actorUserId: string;
        resourceType: string;
        resourceId: string;
        metadata: Record<string, unknown> | null;
        createdAt: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    };
    const downloadAuditEvents = auditBody.items.filter(
      (e) => e.eventType === 'download_url_issued',
    );
    expect(downloadAuditEvents.length).toBeGreaterThanOrEqual(1);
    const downloadAudit = downloadAuditEvents[0];
    expect(downloadAudit.actorUserId).toBe(owner.userId);
    expect(downloadAudit.resourceType).toBe('upload_file');
    expect(downloadAudit.resourceId).toBe(originalFile!.id);

    const storage = app.get(StorageService);
    for (const key of deriveUploadObjectKeys(owner.userId, uploadId, detailBody.files)) {
      await storage.deleteObject(key);
    }
  }, 60_000);
  it('moves linked uploads with catalogs and preserves draft retry', async () => {
    const owner = await registerUser(app, 'move-owner@example.com', 'password123', 'Owner');
    const other = await registerUser(app, 'move-other@example.com', 'password123', 'Other');
    const property = {
      name: 'Source',
      owner: 'Owner',
      address: 'Address',
      latitude: 0,
      longitude: 0,
    };
    const propertyId = await createProperty(app, owner.accessToken, property);
    const destination = await createProperty(app, other.accessToken, {
      ...property,
      name: 'Destination',
    });
    const talhaoId = await createTalhao(app, owner.accessToken, 'Field', propertyId);
    const cropTypeId = await createCropType(app, owner.accessToken, 'Source crop');
    const destinationCrop = await createCropType(app, other.accessToken, 'Destination crop');
    const estadioId = await createEstadio(app, owner.accessToken, 'Stage', cropTypeId);
    const payload = {
      clientUploadId: 'move-draft',
      propertyId,
      talhaoId,
      cropTypeId,
      estadioId,
      source: 'phone',
      activityDate: new Date().toISOString(),
      latitude: 0,
      longitude: 0,
      files: [{ contentType: 'image/png', sizeBytes: 100 }],
    };
    const init = await request(app.getHttpServer())
      .post('/api/uploads/init')
      .auth(owner.accessToken, { type: 'bearer' })
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/talhoes/${talhaoId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ propertyId: destination })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/estadios/${estadioId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ cropTypeId: destinationCrop })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/uploads/${init.body.uploadId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(detail.body.propertyId).toBe(destination);
    expect(detail.body.cropTypeId).toBe(destinationCrop);
    await request(app.getHttpServer())
      .patch(`/api/talhoes/${talhaoId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Renamed field', propertyId: destination })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/estadios/${estadioId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Renamed stage', cropTypeId: destinationCrop })
      .expect(200);
    const unchanged = await request(app.getHttpServer())
      .get(`/api/uploads/${init.body.uploadId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(unchanged.body.updatedAt).toBe(detail.body.updatedAt);
    await request(app.getHttpServer())
      .post('/api/uploads/init')
      .auth(owner.accessToken, { type: 'bearer' })
      .send(payload)
      .expect(201);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const [job] = await db
      .insert(uploadFinalizationJobs)
      .values({ uploadId: init.body.uploadId, status: 'pending' })
      .returning();
    await request(app.getHttpServer())
      .delete(`/api/talhoes/${talhaoId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    const [terminated] = await db
      .select()
      .from(uploadFinalizationJobs)
      .where(eq(uploadFinalizationJobs.id, job.id));
    expect(terminated.status).toBe('dead');
    expect(terminated.completedAt).not.toBeNull();
    await app
      .get(RetentionRepository)
      .pruneExpired(new Date(terminated.completedAt!.getTime() - 1).toISOString(), 100);
    expect(
      await db.select().from(uploadFinalizationJobs).where(eq(uploadFinalizationJobs.id, job.id)),
    ).toHaveLength(1);
    await app
      .get(RetentionRepository)
      .pruneExpired(new Date(terminated.completedAt!.getTime() + 1000).toISOString(), 100);
    expect(
      await db.select().from(uploadFinalizationJobs).where(eq(uploadFinalizationJobs.id, job.id)),
    ).toHaveLength(0);
  });
});
