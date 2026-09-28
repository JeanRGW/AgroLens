import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import {
  UploadsRepository,
  JobsRepository,
  type Upload,
  type UploadFile,
} from '../database/repositories';
import { StorageService } from '../storage/storage.service';
import { sanitizeError } from '../common/sanitize-error';
import { ImageProcessingService } from '../image-processing/image-processing.service';
import { uploadFiles, objectDeletionJobs } from '../database/schema';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database/database.constants';

@Injectable()
export class FinalizationService {
  private readonly logger = new Logger(FinalizationService.name);

  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly workerId: string;
  private readonly maxFileSizeBytes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly storageService: StorageService,
    private readonly imageProcessingService: ImageProcessingService,
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {
    this.maxAttempts = this.configService.get<number>('WORKER_FINALIZATION_MAX_ATTEMPTS', 3);
    this.leaseMs = this.configService.get<number>('WORKER_LEASE_MS', 120000);
    this.workerId =
      this.configService.get<string>('WORKER_ID') ??
      `worker-${hostname()}-${process.pid}-${randomUUID()}`;
    this.maxFileSizeBytes = this.configService.get<number>(
      'UPLOAD_MAX_FILE_SIZE_BYTES',
      100 * 1024 * 1024,
    );
  }

  /**
   * Process a single finalization job.
   * Called by the worker poll loop.
   * Returns true if a job was processed (success or failure), false if no jobs available.
   */
  async processNextJob(shutdownSignal?: AbortSignal): Promise<boolean> {
    const claimed = await this.jobsRepository.claimFinalizationJob(
      this.workerId,
      this.leaseMs,
      this.maxAttempts,
    );
    if (!claimed) return false;
    const job = claimed;
    const pollId = randomUUID();
    const startedAt = performance.now();
    const token = job.lockToken;
    if (!token) throw new Error(`Finalization job ${job.id} was claimed without a lock token`);

    this.logger.log(
      JSON.stringify({
        event: 'job_processing',
        workerId: this.workerId,
        type: 'finalization',
        pollId,
        jobId: job.id,
        attempt: claimed.attempts,
      }),
    );

    try {
      const upload = await this.uploadsRepository.findByIdAnyStatus(job.uploadId);
      if (upload?.status === 'ready') {
        if (!(await this.verifyReadyUpload(upload, shutdownSignal))) return true;
      } else {
        const stillOwned = await this.finalizeUpload(job.id, job.uploadId, token, shutdownSignal);
        if (!stillOwned) return true;
      }
      if (!(await this.jobsRepository.completeFinalizationAndUpload(job.id, job.uploadId, token)))
        return true;
      this.logger.log(
        JSON.stringify({
          event: 'job_completed',
          workerId: this.workerId,
          type: 'finalization',
          pollId,
          jobId: job.id,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        JSON.stringify({
          event: 'job_failed',
          workerId: this.workerId,
          type: 'finalization',
          pollId,
          jobId: job.id,
          durationMs: Math.round(performance.now() - startedAt),
          error: sanitizeError(error),
        }),
      );

      const outcome = await this.jobsRepository.failFinalizationAndUpload(
        job.id,
        job.uploadId,
        job.lockToken!,
        errorMessage,
        this.maxAttempts,
      );

      // Only the fenced owner may mark an exhausted upload failed.
      if (outcome === 'dead') {
        this.logger.warn(
          `Upload ${job.uploadId} marked as failed after ${claimed.attempts} attempts`,
        );
      }

      return true; // Job was processed (even if it failed)
    }
  }

  private async verifyReadyUpload(upload: Upload, shutdownSignal?: AbortSignal): Promise<boolean> {
    const files = await this.uploadsRepository.findFilesByUploadId(upload.id);
    const originals = files.filter((file) => file.variant === 'original');
    const previews = files.filter((file) => file.variant === 'preview');
    const expectedPreviews = new Map(originals.map((file) => [file.imageId, file]));
    if (
      originals.length === 0 ||
      previews.length !== originals.length ||
      previews.some((file) => !expectedPreviews.has(file.imageId))
    ) {
      throw new Error(
        `Ready upload ${upload.id} has incomplete file metadata; preserving ready status`,
      );
    }
    for (const file of [...originals, ...previews]) {
      if (shutdownSignal?.aborted) return false;
      const head = await this.storageService.headObject(file.objectKey);
      if (!head.exists) throw new Error(`Ready upload ${upload.id} is missing a stored object`);
    }
    this.logger.warn(`Recovered already-ready upload ${upload.id} without reprocessing`);
    return true;
  }

  /**
   * Core finalization logic:
   * 1. Verify original objects exist in storage
   * 2. Download and probe/decode image bytes
   * 3. Generate preview with sharp
   * 4. Upload preview to storage
   * 5. Update file records with metadata
   * 6. Mark upload as ready
   */
  private async finalizeUpload(
    jobId: string,
    uploadId: string,
    token: string,
    shutdownSignal?: AbortSignal,
  ): Promise<boolean> {
    // Load upload
    const upload = await this.uploadsRepository.findByIdAnyStatus(uploadId);
    if (!upload) {
      throw new Error(`Upload ${uploadId} not found`);
    }

    if (upload.status !== 'finalizing') {
      throw new Error(`Upload ${uploadId} is in "${upload.status}" status, expected "finalizing"`);
    }

    // Load expected file rows
    const files = await this.uploadsRepository.findFilesByUploadId(uploadId);
    const originals = files.filter((f) => f.variant === 'original');

    if (originals.length === 0) {
      throw new Error(`No original file records found for upload ${uploadId}`);
    }

    // Process each original
    for (const original of originals) {
      if (shutdownSignal?.aborted) return false;
      if (!(await this.jobsRepository.touchFinalizationJob(jobId, token))) {
        this.logger.warn(
          `Finalization job ${jobId} lease expired or ownership lost; aborting remaining images`,
        );
        return false;
      }
      if (!(await this.processOriginalFile(upload, original, jobId, token))) return false;
    }

    // The fenced repository transaction performs the ready transition after all
    // external work has succeeded.
    this.logger.log(`Upload ${uploadId} prepared as ready with ${originals.length} images`);
    return true;
  }
  /**
   * Process a single original file:
   * - Verify object exists via HEAD
   * - Download buffer
   * - Probe/decode image
   * - Generate preview
   * - Upload preview
   * - Update file records
   */
  private async processOriginalFile(
    upload: Upload,
    original: UploadFile,
    jobId: string,
    token: string,
  ): Promise<boolean> {
    // 1. Verify object exists
    const headResult = await this.storageService.headObject(original.objectKey);
    if (!headResult.exists) {
      throw new Error(
        `Original file ${original.id} not found in storage. ` +
          'The client may not have uploaded the file yet.',
      );
    }

    if (headResult.contentLength === undefined || headResult.contentLength <= 0) {
      throw new Error(`File ${original.id} has unknown or invalid size`);
    }
    if (headResult.contentLength > this.maxFileSizeBytes) {
      throw new Error(
        `File ${original.id} exceeds maximum size: ${headResult.contentLength} bytes`,
      );
    }

    if (!original.observedEtag) throw new Error(`File ${original.id} has no storage seal`);

    // 2. Download buffer (one image at a time to limit memory), sealed and bounded.
    const buffer = await this.storageService.getObjectBufferBounded(
      original.objectKey,
      this.maxFileSizeBytes,
      original.observedEtag,
    );

    // 3. Probe/decode image bytes (ignores client-provided content type)
    const probe = await this.imageProcessingService.probeImage(buffer);

    // 4. Generate preview
    const preview = await this.imageProcessingService.generatePreview(buffer);

    // Client PUT URLs target staging only. Persist the exact bytes we validated
    // under a server-owned key before exposing the upload as ready.
    const originalObjectKey = original.objectKey.replace(/^staging\//, '');
    const previewObjectKey = `uploads/${upload.userId}/${upload.id}/${original.imageId}/preview.jpg`;
    return this.db.transaction(async (tx) => {
      // Lock upload before job, as completion, reaping and deletion do. Keep
      // these locks through the bounded PUTs: fencing metadata alone cannot
      // prevent a stale worker from overwriting deterministic storage keys.
      const parent = await tx.execute(sql`SELECT id FROM uploads
        WHERE id = ${upload.id} AND status = 'finalizing' AND deleted_at IS NULL FOR UPDATE`);
      if (!parent.length) return false;
      const owned = await tx.execute(sql`SELECT id FROM upload_finalization_jobs
        WHERE id = ${jobId} AND upload_id = ${upload.id} AND status = 'running'
          AND lock_token = ${token} FOR UPDATE`);
      if (!owned.length) return false;

      const stored = await this.storageService.putObject(
        originalObjectKey,
        buffer,
        probe.contentType,
      );
      if (!stored.etag) throw new Error(`Finalized original ${original.id} has no storage seal`);
      const observedEtag = stored.etag.replace(/^"|"$/g, '');
      await this.storageService.putObject(previewObjectKey, preview.buffer, preview.contentType);
      await tx
        .update(uploadFiles)
        .set({
          objectKey: originalObjectKey,
          observedEtag,
          contentType: probe.contentType,
          sizeBytes: buffer.length,
          width: probe.width,
          height: probe.height,
        })
        .where(eq(uploadFiles.id, original.id));
      if (originalObjectKey !== original.objectKey) {
        // Wait out every issued PUT URL so a late client retry cannot recreate
        // staging bytes after cleanup has already finished.
        const ttl = this.configService.get<number>('UPLOAD_PRESIGNED_URL_TTL_SECONDS', 900);
        await tx.insert(objectDeletionJobs).values({
          uploadId: upload.id,
          objectKey: original.objectKey,
          runAfter: new Date(Date.now() + ttl * 1000),
        });
      }
      const previewFile = {
        imageId: original.imageId,
        variant: 'preview',
        objectKey: previewObjectKey,
        contentType: preview.contentType,
        sizeBytes: preview.buffer.length,
        width: preview.width,
        height: preview.height,
      };
      await tx
        .insert(uploadFiles)
        .values(previewFile)
        .onConflictDoUpdate({
          target: [uploadFiles.imageId, uploadFiles.variant],
          set: previewFile,
        });
      await tx.execute(
        sql`UPDATE upload_finalization_jobs SET locked_at = clock_timestamp() WHERE id = ${jobId}`,
      );
      return true;
    });
  }
}
