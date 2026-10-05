import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InferenceService } from '../../src/worker/inference.service';
import { InferenceRepository, InferenceModelsRepository } from '../../src/database/repositories';
import type { InferenceModel, InferenceJobImage } from '../../src/database/repositories';
import { StorageService } from '../../src/storage/storage.service';
import { InferenceClient, InferenceHttpError } from '../../src/inference/inference-client';

// ── Helpers ──────────────────────────────────────────────────────────

function makeModel(overrides: Partial<InferenceModel> = {}): InferenceModel {
  return {
    id: 'model-uuid-1',
    name: 'Test Model',
    description: null,
    objectKey: 'models/model-uuid-1/best.pt',
    sizeBytes: 1024,
    sha256: 'abc123',
    status: 'validating',
    active: false,
    task: null,
    classes: null,
    validationAttempts: 1,
    errorMessage: null,
    createdByUserId: 'admin-uuid-1',
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeImage(overrides: Partial<InferenceJobImage> = {}): InferenceJobImage {
  return {
    id: 'image-uuid-1',
    jobId: 'job-uuid-1',
    uploadImageId: null,
    imageIndex: 0,
    fileName: 'test.jpg',
    sourceObjectKey: 'temp/job-uuid-1/0.jpg',
    observedEtag: 'etag-1',
    width: null,
    height: null,
    status: 'queued',
    detections: null,
    inferenceMs: null,
    attempts: 1,
    errorMessage: null,
    retryAfter: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    userId: 'user-uuid-1',
    modelId: 'model-uuid-1',
    modelSnapshot: { id: 'model-uuid-1', name: 'Test', task: 'detect', classes: [] },
    sourceType: 'upload',
    uploadId: 'upload-uuid-1',
    status: 'queued',
    imageCount: 2,
    completedCount: 0,
    failedCount: 0,
    errorMessage: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(Date.now() + 1000 * 3600),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('InferenceService (worker)', () => {
  let service: InferenceService;

  const mockInferenceRepository = {
    claimValidation: jest.fn(),
    completeValidation: jest.fn(),
    listQueuedJobIds: jest.fn(),
    claimNextImage: jest.fn(),
    failExhaustedImages: jest.fn().mockResolvedValue(undefined),
    findJobById: jest.fn(),
    findModelById: jest.fn(),
    completeImage: jest.fn(),
    failImage: jest.fn(),
    retryImage: jest.fn(),
    markJobRunningIfNeeded: jest.fn(),
    findExpiredJobs: jest.fn(),
    deleteJob: jest.fn(),
    softDeleteModel: jest.fn(),
    findAbandonedModelUploads: jest.fn(),
    sealAndCompleteTemporaryJob: jest.fn(),
  };

  const mockStorageService = {
    getObjectBufferBounded: jest.fn(),
    getPresignedGetUrl: jest.fn(),
  };

  const mockInferenceClient = {
    inspectModel: jest.fn(),
    predict: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'WORKER_INFERENCE_MAX_IMAGE_ATTEMPTS') return 3;
      return def;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default returns for no-work scenarios
    mockInferenceRepository.claimValidation.mockResolvedValue(undefined);
    mockInferenceRepository.completeValidation.mockResolvedValue(makeModel());
    mockInferenceRepository.listQueuedJobIds.mockResolvedValue([]);
    mockInferenceRepository.findExpiredJobs.mockResolvedValue([]);
    mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InferenceService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: InferenceRepository, useValue: mockInferenceRepository },
        { provide: InferenceModelsRepository, useValue: mockInferenceRepository },
        { provide: StorageService, useValue: mockStorageService },
        { provide: InferenceClient, useValue: mockInferenceClient },
      ],
    }).compile();

    service = module.get<InferenceService>(InferenceService);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  processNextModelValidation
  // ═══════════════════════════════════════════════════════════════════

  describe('processNextModelValidation', () => {
    it('should return false when no stale model is available', async () => {
      mockInferenceRepository.claimValidation.mockResolvedValue(undefined);
      const result = await service.processNextModelValidation();
      expect(result).toBe(false);
    });

    it('should validate model successfully (task=detect) and mark ready', async () => {
      const model = makeModel({ status: 'validating', validationAttempts: 1 });
      mockInferenceRepository.claimValidation.mockResolvedValue(model);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.inspectModel.mockResolvedValue({
        task: 'detect',
        classes: ['weed', 'crop'],
        sha256: 'abc123',
      });

      const result = await service.processNextModelValidation();

      expect(result).toBe(true);
      expect(mockInferenceRepository.completeValidation).toHaveBeenCalledWith(
        model.id,
        model.validationAttempts,
        {
          status: 'ready',
          task: 'detect',
          classes: ['weed', 'crop'],
          sha256: 'abc123',
          errorMessage: null,
        },
      );
    });

    it('should mark model invalid when task is not detect', async () => {
      const model = makeModel({ status: 'validating', validationAttempts: 1 });
      mockInferenceRepository.claimValidation.mockResolvedValue(model);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.inspectModel.mockResolvedValue({
        task: 'classify',
        classes: [],
      });

      const result = await service.processNextModelValidation();

      expect(result).toBe(true);
      expect(mockInferenceRepository.completeValidation).toHaveBeenCalledWith(
        model.id,
        model.validationAttempts,
        {
          status: 'invalid',
          errorMessage: expect.stringContaining('"classify"'),
        },
      );
    });

    it('should leave model validating when load fails and attempts < max', async () => {
      const model = makeModel({ status: 'validating', validationAttempts: 1 });
      mockInferenceRepository.claimValidation.mockResolvedValue(model);
      mockStorageService.getPresignedGetUrl.mockRejectedValue(new Error('S3 error'));

      const result = await service.processNextModelValidation();

      expect(result).toBe(true);
      expect(mockInferenceRepository.completeValidation).not.toHaveBeenCalled();
    });

    it('should mark model invalid when load fails and attempts >= max', async () => {
      const model = makeModel({
        status: 'validating',
        validationAttempts: 3, // max reached (was incremented by claim)
      });
      mockInferenceRepository.claimValidation.mockResolvedValue(model);
      mockStorageService.getPresignedGetUrl.mockRejectedValue(new Error('S3 error'));

      const result = await service.processNextModelValidation();

      expect(result).toBe(true);
      expect(mockInferenceRepository.completeValidation).toHaveBeenCalledWith(
        model.id,
        model.validationAttempts,
        {
          status: 'invalid',
          errorMessage: 'S3 error',
        },
      );
    });

    it('propagates a claim failure to the runtime backoff', async () => {
      const error = new Error('DB connection lost');
      mockInferenceRepository.claimValidation.mockRejectedValue(error);
      await expect(service.processNextModelValidation()).rejects.toBe(error);
      expect(mockInferenceRepository.completeValidation).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  processNextInferenceImage
  // ═══════════════════════════════════════════════════════════════════

  describe('processNextInferenceImage', () => {
    it.each(['listQueuedJobIds', 'claimNextImage'] as const)(
      'propagates a %s failure to the runtime backoff',
      async (operation) => {
        const error = new Error('DB connection lost');
        mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
        mockInferenceRepository[operation].mockRejectedValueOnce(error);
        await expect(service.processNextInferenceImage()).rejects.toBe(error);
        expect(mockInferenceRepository.retryImage).not.toHaveBeenCalled();
        expect(mockInferenceRepository.failImage).not.toHaveBeenCalled();
      },
    );
    it('should return false when no queued jobs', async () => {
      mockInferenceRepository.listQueuedJobIds.mockResolvedValue([]);
      const result = await service.processNextInferenceImage();
      expect(result).toBe(false);
    });

    it('should return false when no claimable image', async () => {
      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(undefined);
      const result = await service.processNextInferenceImage();
      expect(result).toBe(false);
    });

    it('should process image successfully', async () => {
      const image = makeImage({ status: 'queued', attempts: 1 });
      const model = makeModel({ status: 'ready', task: 'detect' });
      const job = makeJob({ status: 'queued' });

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.markJobRunningIfNeeded.mockResolvedValue(undefined);
      mockInferenceRepository.findJobById.mockResolvedValue(job as any);
      mockInferenceRepository.findModelById.mockResolvedValue(model);
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.predict.mockResolvedValue({
        detections: [
          {
            classId: 0,
            className: 'weed',
            confidence: 0.9,
            xCenter: 0.5,
            yCenter: 0.5,
            width: 0.2,
            height: 0.3,
          },
        ],
        width: 640,
        height: 480,
        inferenceMs: 150,
      });

      const result = await service.processNextInferenceImage();

      expect(result).toBe(true);
      expect(mockInferenceRepository.markJobRunningIfNeeded).toHaveBeenCalledWith('job-uuid-1');
      expect(mockStorageService.getObjectBufferBounded).toHaveBeenCalledWith(
        image.sourceObjectKey,
        25 * 1024 * 1024,
        'etag-1',
        undefined,
      );
      expect(mockInferenceClient.predict).toHaveBeenCalledWith(
        expect.any(Buffer),
        'https://presigned/model.pt',
        model.sha256,
        undefined,
      );
      expect(mockInferenceRepository.completeImage).toHaveBeenCalledWith(
        image.id,
        {
          detections: expect.any(Array),
          inferenceMs: 150,
          width: 640,
          height: 480,
        },
        image.attempts,
      );
    });

    it('should round fractional inferenceMs to an integer before persistence', async () => {
      const image = makeImage({ status: 'queued', attempts: 1 });
      const model = makeModel({ status: 'ready', task: 'detect' });
      const job = makeJob({ status: 'queued' });

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.markJobRunningIfNeeded.mockResolvedValue(undefined);
      mockInferenceRepository.findJobById.mockResolvedValue(job as any);
      mockInferenceRepository.findModelById.mockResolvedValue(model);
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.predict.mockResolvedValue({
        detections: [],
        width: 640,
        height: 480,
        inferenceMs: 150.7, // fractional — must be rounded
      });

      const result = await service.processNextInferenceImage();

      expect(result).toBe(true);
      expect(mockInferenceRepository.completeImage).toHaveBeenCalledWith(
        image.id,
        {
          detections: [],
          inferenceMs: 151, // Math.round(150.7)
          width: 640,
          height: 480,
        },
        image.attempts,
      );
    });

    it('should requeue image without failing when attempts < max', async () => {
      const image = makeImage({ status: 'queued', attempts: 1 });
      const model = makeModel({ status: 'ready' });
      const job = makeJob();

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.markJobRunningIfNeeded.mockResolvedValue(undefined);
      mockInferenceRepository.findJobById.mockResolvedValue(job as any);
      mockInferenceRepository.findModelById.mockResolvedValue(model);
      mockStorageService.getObjectBufferBounded.mockRejectedValue(new Error('S3 download error'));

      const result = await service.processNextInferenceImage();

      expect(result).toBe(true);
      expect(mockInferenceRepository.retryImage).toHaveBeenCalledWith(
        image.id,
        image.attempts,
        'S3 download error',
      );
      expect(mockInferenceRepository.failImage).not.toHaveBeenCalled();
    });

    it('should fail image without requeue when attempts >= max', async () => {
      const image = makeImage({ status: 'queued', attempts: 3 }); // max reached
      const model = makeModel({ status: 'ready' });
      const job = makeJob();

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.markJobRunningIfNeeded.mockResolvedValue(undefined);
      mockInferenceRepository.findJobById.mockResolvedValue(job as any);
      mockInferenceRepository.findModelById.mockResolvedValue(model);
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.predict.mockRejectedValue(new Error('predict failed'));

      const result = await service.processNextInferenceImage();

      expect(result).toBe(true);
      expect(mockInferenceRepository.failImage).toHaveBeenCalledWith(
        image.id,
        'predict failed',
        image.attempts,
      );
      // retryImage should NOT be called since attempts >= max
      expect(mockInferenceRepository.retryImage).not.toHaveBeenCalled();
    });

    it('should not retry a deterministic inference client error', async () => {
      const image = makeImage({ status: 'running', attempts: 1 });
      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.findJobById.mockResolvedValue(makeJob() as any);
      mockInferenceRepository.findModelById.mockResolvedValue(makeModel({ status: 'ready' }));
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('bad-image'));
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://presigned/model.pt',
        expiresAt: new Date(),
      });
      mockInferenceClient.predict.mockRejectedValue(new InferenceHttpError(422, 'invalid image'));

      expect(await service.processNextInferenceImage()).toBe(true);
      expect(mockInferenceRepository.failImage).toHaveBeenCalledWith(
        image.id,
        'invalid image',
        image.attempts,
      );
      expect(mockInferenceRepository.retryImage).not.toHaveBeenCalled();
    });

    it('should handle missing job gracefully', async () => {
      const image = makeImage();

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.findJobById.mockResolvedValue(undefined);

      const result = await service.processNextInferenceImage();

      // Should not throw — returns true (processed with error)
      expect(result).toBe(true);
      expect(mockInferenceRepository.retryImage).toHaveBeenCalled();
    });

    it('should handle model not ready gracefully', async () => {
      const image = makeImage();
      const job = makeJob();
      const model = makeModel({ status: 'invalid' });

      mockInferenceRepository.listQueuedJobIds.mockResolvedValue(['job-uuid-1']);
      mockInferenceRepository.claimNextImage.mockResolvedValue(image);
      mockInferenceRepository.markJobRunningIfNeeded.mockResolvedValue(undefined);
      mockInferenceRepository.findJobById.mockResolvedValue(job as any);
      mockInferenceRepository.findModelById.mockResolvedValue(model);

      const result = await service.processNextInferenceImage();

      expect(result).toBe(true);
      expect(mockInferenceRepository.retryImage).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  processExpiredJobs
  // ═══════════════════════════════════════════════════════════════════

  describe('processExpiredJobs', () => {
    it('should return false when no expired jobs or abandoned models', async () => {
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([]);
      const result = await service.processExpiredJobs();
      expect(result).toBe(false);
    });

    it('should delete expired job and enqueue temp keys', async () => {
      const job = makeJob({ status: 'completed', sourceType: 'temporary' });
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([job as any]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([]);
      mockInferenceRepository.deleteJob.mockResolvedValue(job);

      const result = await service.processExpiredJobs();

      expect(result).toBe(true);
      expect(mockInferenceRepository.deleteJob).toHaveBeenCalledWith(job.id);
    });

    it('should delete expired upload-based job without enqueuing keys', async () => {
      const job = makeJob({ status: 'failed', sourceType: 'upload' });
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([job as any]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([]);
      mockInferenceRepository.deleteJob.mockResolvedValue(job);

      const result = await service.processExpiredJobs();

      expect(result).toBe(true);
      expect(mockInferenceRepository.deleteJob).toHaveBeenCalledWith(job.id);
    });

    it('should clean up abandoned model uploads', async () => {
      const model = makeModel({ status: 'uploading' });
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([model]);
      mockInferenceRepository.softDeleteModel.mockResolvedValue(model);

      const result = await service.processExpiredJobs();

      expect(result).toBe(true);
      expect(mockInferenceRepository.softDeleteModel).toHaveBeenCalledWith(model.id);
    });

    it('should continue processing when one expired job fails to delete', async () => {
      const job1 = makeJob({ id: 'job-1', status: 'completed', sourceType: 'temporary' });
      const job2 = makeJob({ id: 'job-2', status: 'failed', sourceType: 'upload' });
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([job1 as any, job2 as any]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([]);

      // First deleteJob throws, second succeeds
      mockInferenceRepository.deleteJob
        .mockRejectedValueOnce(new Error('FK constraint'))
        .mockResolvedValueOnce(job2);

      const result = await service.processExpiredJobs();

      expect(result).toBe(true); // At least one was processed
      expect(mockInferenceRepository.deleteJob).toHaveBeenCalledTimes(2);
    });

    it('should return true when only abandoned models are processed', async () => {
      const model = makeModel({ id: 'stale-upload', status: 'uploading' });
      mockInferenceRepository.findExpiredJobs.mockResolvedValue([]);
      mockInferenceRepository.findAbandonedModelUploads.mockResolvedValue([model]);
      mockInferenceRepository.softDeleteModel.mockResolvedValue(model);

      const result = await service.processExpiredJobs();

      expect(result).toBe(true);
    });

    it('should catch outer error and return false', async () => {
      mockInferenceRepository.findExpiredJobs.mockRejectedValue(new Error('DB connection lost'));
      const result = await service.processExpiredJobs();
      expect(result).toBe(false);
    });
  });
});
