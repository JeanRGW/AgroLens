import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  InferenceRepository,
  InferenceModelsRepository,
  MAX_VALIDATION_ATTEMPTS,
} from '../database/repositories';
import { StorageService } from '../storage/storage.service';
import { InferenceClient, InferenceHttpError } from '../inference/inference-client';
import { sanitizeError } from '../common/sanitize-error';

/** Presigned URL TTL for model download (15 min). */
const MODEL_URL_TTL_SECONDS = 900;

@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);

  private readonly maxImageAttempts: number;
  private readonly maxImageBytes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly inferenceRepository: InferenceRepository,
    private readonly modelsRepository: InferenceModelsRepository,
    private readonly storageService: StorageService,
    private readonly inferenceClient: InferenceClient,
  ) {
    this.maxImageAttempts = this.configService.get<number>(
      'WORKER_INFERENCE_MAX_IMAGE_ATTEMPTS',
      3,
    );
    this.maxImageBytes = this.configService.get<number>(
      'INFERENCE_PREDICT_MAX_SIZE_BYTES',
      this.configService.get<number>('INFERENCE_TEMP_MAX_FILE_SIZE_BYTES', 25 * 1024 * 1024),
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  1. Model validation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Claim a stale validating model, run inspectModel against the Python
   * service, and transition it to 'ready' or 'invalid'.
   *
   * Returns true if a model was processed (success or terminal failure),
   * false if no model was eligible.
   */
  async processNextModelValidation(signal?: AbortSignal): Promise<boolean> {
    const pollId = randomUUID();
    const startedAt = performance.now();
    // Claim failures must reach the runtime's polling backoff, not count as work.
    const model = await this.modelsRepository.claimValidation();
    if (!model) return false;
    try {
      this.logger.log(
        JSON.stringify({
          event: 'job_processing',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'model_validation',
          pollId,
          jobId: model.id,
          attempt: model.validationAttempts,
        }),
      );

      // Generate a short-lived presigned GET URL so the Python service can download the model
      const { url: modelUrl } = await this.storageService.getPresignedGetUrl(
        model.objectKey,
        MODEL_URL_TTL_SECONDS,
        'service',
      );

      const inspection = await this.inferenceClient.inspectModel(modelUrl, signal);

      // Guard: inference service only supports 'detect' models
      if (!inspection.task || inspection.task !== 'detect') {
        const msg = `Model task is "${inspection.task ?? 'unknown'}", only "detect" is supported`;
        this.logger.warn(
          JSON.stringify({
            event: 'job_rejected',
            type: 'model_validation',
            jobId: model.id,
            error: sanitizeError(msg),
          }),
        );
        await this.modelsRepository.completeValidation(model.id, model.validationAttempts, {
          status: 'invalid',
          errorMessage: msg,
        });
        return true;
      }

      // Success — mark ready
      const completed = await this.modelsRepository.completeValidation(
        model.id,
        model.validationAttempts,
        {
          status: 'ready',
          task: inspection.task,
          classes: inspection.classes ?? null,
          sha256: inspection.sha256,
          errorMessage: null,
        },
      );
      if (!completed) return true;
      this.logger.log(
        JSON.stringify({
          event: 'job_completed',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'model_validation',
          pollId,
          jobId: model.id,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return true;
    } catch (error: unknown) {
      if (signal?.aborted) return true;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        JSON.stringify({
          event: 'job_failed',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'model_validation',
          pollId,
          jobId: model.id,
          durationMs: Math.round(performance.now() - startedAt),
          error: sanitizeError(error),
        }),
      );

      // validationAttempts was already incremented by claimValidation.
      if (model.validationAttempts >= MAX_VALIDATION_ATTEMPTS) {
        const failed = await this.modelsRepository.completeValidation(
          model.id,
          model.validationAttempts,
          {
            status: 'invalid',
            errorMessage: message,
          },
        );
        if (!failed) return true;
        this.logger.warn(
          JSON.stringify({
            event: 'job_exhausted',
            type: 'model_validation',
            jobId: model.id,
            attempts: model.validationAttempts,
          }),
        );
      }
      // Otherwise leave validating so it can be reclaimed after the stale window.
      return true; // We processed (attempted) this model
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2. Inference image processing
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Find a queued job, claim its next image, download it, run predict,
   * and record the result.
   *
   * Returns true if an image was processed, false if no work was available.
   */
  async processNextInferenceImage(signal?: AbortSignal): Promise<boolean> {
    const pollId = randomUUID();
    const startedAt = performance.now();
    const jobIds = await this.inferenceRepository.listQueuedJobIds(1);
    if (jobIds.length === 0) return false;

    const jobId = jobIds[0];

    // List/claim failures propagate so the runtime waits before polling again.
    const image = await this.inferenceRepository.claimNextImage(jobId, this.maxImageAttempts);
    if (!image) return false;

    try {
      // 3. Mark the job as running if it's still queued
      await this.inferenceRepository.markJobRunningIfNeeded(jobId);

      this.logger.log(
        JSON.stringify({
          event: 'job_processing',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'inference_image',
          pollId,
          jobId: image.id,
          attempt: image.attempts,
        }),
      );

      // 4. Load the model (must be ready)
      const job = await this.inferenceRepository.findJobById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const model = await this.modelsRepository.findModelById(job.modelId);
      if (!model || model.status !== 'ready') {
        throw new Error(`Model ${job.modelId} is not ready (status=${model?.status ?? 'deleted'})`);
      }

      // 5. Download the sealed image buffer within the configured limit
      if (!image.observedEtag) throw new Error(`Inference image ${image.id} has no storage seal`);
      const imageBuffer = await this.storageService.getObjectBufferBounded(
        image.sourceObjectKey,
        this.maxImageBytes,
        image.observedEtag,
        signal,
      );

      // 6. Generate presigned GET URL for the model (so the Python service can download it)
      const { url: modelUrl } = await this.storageService.getPresignedGetUrl(
        model.objectKey,
        MODEL_URL_TTL_SECONDS,
        'service',
      );

      // 7. Run prediction
      const result = await this.inferenceClient.predict(
        imageBuffer,
        modelUrl,
        model.sha256 ?? '',
        signal,
      );

      // 8. Record completion (atomically updates job counters)
      //    inferenceMs may be fractional from the inference service; the DB column
      //    is an integer, so round at the worker boundary before persistence.
      const inferenceMs = result.inferenceMs == null ? null : Math.round(result.inferenceMs);
      await this.inferenceRepository.completeImage(
        image.id,
        {
          detections: result.detections,
          inferenceMs,
          width: result.width,
          height: result.height,
        },
        image.attempts,
      );
      this.logger.log(
        JSON.stringify({
          event: 'job_completed',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'inference_image',
          pollId,
          jobId: image.id,
          durationMs: Math.round(performance.now() - startedAt),
          detections: result.detections.length,
        }),
      );
      return true;
    } catch (error: unknown) {
      if (signal?.aborted) return true;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        JSON.stringify({
          event: 'job_failed',
          workerId: this.configService.get<string>('WORKER_ID', 'worker'),
          type: 'inference_image',
          pollId,
          jobId: image.id,
          durationMs: Math.round(performance.now() - startedAt),
          error: sanitizeError(error),
        }),
      );

      const nonRetryable =
        error instanceof InferenceHttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429;
      if (!nonRetryable && image.attempts < this.maxImageAttempts) {
        // Requeue for retry without failing first — failing would recompute
        // job counters and potentially mark the job terminal prematurely.
        await this.inferenceRepository.retryImage(image.id, image.attempts, message);
        this.logger.log(
          `Image ${image.id} requeued for retry (next attempt ${image.attempts + 1})`,
        );
      } else {
        // Permanently fail — failImage recomputes job counters
        await this.inferenceRepository.failImage(image.id, message, image.attempts);
        this.logger.warn(
          JSON.stringify({
            event: 'job_exhausted',
            type: 'inference_image',
            jobId: image.id,
            attempts: image.attempts,
          }),
        );
      }
      return true; // We processed (attempted) this image
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  3. Expiry & abandoned upload cleanup
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Delete expired inference jobs and clean up abandoned model uploads.
   *
   * Expired jobs: deleteJob removes the job (images cascade) and enqueues
   * temporary-object cleanup in the same transaction.
   *
   * Abandoned models: models stuck in 'uploading' for >24h are soft-deleted
   * and their objectKey is enqueued for S3 deletion in the same transaction.
   *
   * Returns true if at least one entity was processed.
   */
  async processExpiredJobs(): Promise<boolean> {
    let processed = false;

    try {
      // ── Expired jobs ──────────────────────────────────────────────
      await this.inferenceRepository.failExhaustedImages(this.maxImageAttempts);
      const expiredJobs = await this.inferenceRepository.findExpiredJobs(10);
      for (const job of expiredJobs) {
        try {
          const deleted = await this.inferenceRepository.deleteJob(job.id);
          if (!deleted) continue;
          this.logger.log(`Deleted expired job ${job.id} (sourceType=${job.sourceType})`);
          processed = true;
        } catch (error: unknown) {
          this.logger.error(
            JSON.stringify({
              event: 'cleanup_failed',
              type: 'expired_job',
              jobId: job.id,
              sourceType: job.sourceType,
              error: sanitizeError(error),
            }),
          );
        }
      }

      // ── Abandoned model uploads ───────────────────────────────────
      const abandonedModels = await this.modelsRepository.findAbandonedModelUploads(10);
      for (const model of abandonedModels) {
        try {
          const deleted = await this.modelsRepository.softDeleteModel(model.id);
          if (!deleted) continue;
          this.logger.log(
            JSON.stringify({ event: 'cleanup_completed', type: 'model_upload', jobId: model.id }),
          );
          processed = true;
        } catch (error: unknown) {
          this.logger.error(
            JSON.stringify({
              event: 'cleanup_failed',
              type: 'model_upload',
              jobId: model.id,
              error: sanitizeError(error),
            }),
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        JSON.stringify({
          event: 'cleanup_failed',
          type: 'expired_jobs',
          error: sanitizeError(error),
        }),
      );
    }

    return processed;
  }
}
