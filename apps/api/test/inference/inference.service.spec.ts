import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InferenceModelService } from '../../src/inference/inference-model.service';
import { InferenceJobService } from '../../src/inference/inference-job.service';
import { InferenceClient } from '../../src/inference/inference-client';
import {
  InferenceRepository,
  UploadsRepository,
  AccessRepository,
  AuditRepository,
} from '../../src/database/repositories';
import { StorageService } from '../../src/storage/storage.service';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';
import type { InferenceModel } from '../../src/database/repositories';

// ── Helpers ──────────────────────────────────────────────────────────

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-uuid-1',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'user-uuid-1',
      email: 'owner@example.com',
      fullName: 'Test Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    ...overrides,
  };
}

function makeAdminUser(): AuthenticatedUser {
  return makeCurrentUser({
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'admin',
    userRecord: {
      id: 'admin-uuid-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      phone: null,
      role: 'admin',
      disabledAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
  });
}

function makeModel(overrides: Partial<InferenceModel> = {}): InferenceModel {
  return {
    id: 'model-uuid-1',
    name: 'Test Model',
    version: 'v1',
    description: null,
    objectKey: 'models/model-uuid-1/best.pt',
    sizeBytes: 1024,
    sha256: 'abc123',
    status: 'ready',
    active: true,
    task: 'detect',
    classes: ['weed', 'crop'],
    validationAttempts: 0,
    errorMessage: null,
    createdByUserId: 'admin-uuid-1',
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    userId: 'user-uuid-1',
    modelId: 'model-uuid-1',
    modelSnapshot: { id: 'model-uuid-1', name: 'Test', version: 'v1', task: 'detect', classes: [] },
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

function makeUpload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'upload-uuid-1',
    clientUploadId: 'client-1',
    userId: 'user-uuid-1',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    source: 'phone',
    status: 'ready',
    activityDate: new Date('2025-06-15'),
    latitude: -22.9,
    longitude: -43.1,
    errorMessage: null,
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    deletedAt: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('InferenceModelService and InferenceJobService', () => {
  let modelService: InferenceModelService;
  let jobService: InferenceJobService;

  const mockInferenceRepo = {
    createModel: jest.fn(),
    findModelById: jest.fn(),
    listActiveModels: jest.fn(),
    listAllModels: jest.fn(),
    updateModel: jest.fn(),
    softDeleteModel: jest.fn(),
    hasActiveJobsForModel: jest.fn(),
    createJobWithImages: jest.fn(),
    createUploadJobWithFence: jest.fn(),
    findJobById: jest.fn(),
    listJobsByUserId: jest.fn(),
    listImagesByJobId: jest.fn(),
    sealAndCompleteTemporaryJob: jest.fn(),
    failImage: jest.fn(),
    deleteJob: jest.fn(),
  };

  const mockUploadsRepo = {
    findByIdAnyStatus: jest.fn(),
    findFilesByUploadId: jest.fn(),
  };

  const mockAccessRepo = {
    hasAnyActiveGrantForUpload: jest.fn(),
  };

  const mockAuditRepo = {
    create: jest.fn().mockResolvedValue(undefined),
  };

  const mockStorageService = {
    getPresignedPutUrl: jest.fn(),
    getPresignedGetUrl: jest.fn(),
    headObject: jest.fn(),
  };

  const mockInferenceClient = {
    inspectModel: jest.fn(),
    predict: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const defaults: Record<string, unknown> = {
        INFERENCE_MODEL_MAX_SIZE_BYTES: 500 * 1024 * 1024,
        INFERENCE_TEMP_MAX_FILES: 20,
        INFERENCE_TEMP_MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
        RETENTION_DAYS: 7,
        INFERENCE_IMAGE_TTL_SECONDS: 900,
        INFERENCE_UPLOAD_EXPIRY_HOURS: 24,
        UPLOAD_PRESIGNED_URL_TTL_SECONDS: 900,
      };
      return defaults[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockInferenceRepo.createJobWithImages.mockImplementation((job: any) => ({
      ...makeJob(),
      ...job,
    }));
    mockInferenceRepo.createUploadJobWithFence.mockImplementation((job: any) => ({
      ...makeJob(),
      ...job,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InferenceModelService,
        InferenceJobService,
        { provide: InferenceRepository, useValue: mockInferenceRepo },
        { provide: UploadsRepository, useValue: mockUploadsRepo },
        { provide: AccessRepository, useValue: mockAccessRepo },
        { provide: AuditRepository, useValue: mockAuditRepo },
        { provide: StorageService, useValue: mockStorageService },
        { provide: InferenceClient, useValue: mockInferenceClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    modelService = module.get<InferenceModelService>(InferenceModelService);
    jobService = module.get<InferenceJobService>(InferenceJobService);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model init
  // ═══════════════════════════════════════════════════════════════════

  describe('initModel', () => {
    it('should reject non-admin users', async () => {
      await expect(
        modelService.initModel({ name: 'My Model', version: 'v1' }, makeCurrentUser()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create model row and return presigned URL', async () => {
      mockInferenceRepo.createModel.mockResolvedValue(makeModel({ status: 'uploading' }));
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://presigned.url',
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        expiresAt: new Date(),
        objectKey: 'models/model-uuid-1/best.pt',
      });

      const result = await modelService.initModel(
        { name: 'My Model', version: 'v1', description: 'A test model' },
        makeAdminUser(),
      );

      expect(result.id).toBeDefined();
      expect(result.uploadUrl).toBe('https://presigned.url');
      expect(result.headers).toBeDefined();
      expect(mockInferenceRepo.createModel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Model',
          version: 'v1',
          description: 'A test model',
        }),
        expect.objectContaining({ actorUserId: 'admin-uuid-1' }),
      );
      expect(mockStorageService.getPresignedPutUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^models\/.*\/best\.pt$/),
        'application/octet-stream',
        86400,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model complete
  // ═══════════════════════════════════════════════════════════════════

  describe('completeModel', () => {
    it('should reject non-admin', async () => {
      await expect(modelService.completeModel('model-uuid-1', makeCurrentUser())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject non-uploading model', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ status: 'ready' }));
      await expect(modelService.completeModel('model-uuid-1', makeAdminUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should verify file in S3 and transition to validating', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ status: 'uploading' }));
      mockStorageService.headObject.mockResolvedValue({ exists: true, contentLength: 1024 });
      mockInferenceRepo.updateModel.mockResolvedValue(
        makeModel({
          status: 'validating',
          sizeBytes: 1024,
        }),
      );

      const result = await modelService.completeModel('model-uuid-1', makeAdminUser());

      expect(result.status).toBe('validating');
      expect(result.sizeBytes).toBe(1024);
      expect(mockInferenceRepo.updateModel).toHaveBeenCalledWith(
        'model-uuid-1',
        expect.objectContaining({
          status: 'validating',
          sizeBytes: 1024,
        }),
        expect.objectContaining({ eventType: 'model_complete' }),
      );
    });

    it('should reject if file not in S3', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ status: 'uploading' }));
      mockStorageService.headObject.mockResolvedValue({ exists: false });

      await expect(modelService.completeModel('model-uuid-1', makeAdminUser())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if file too large', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ status: 'uploading' }));
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 999 * 1024 * 1024,
      });

      await expect(modelService.completeModel('model-uuid-1', makeAdminUser())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model list (admin)
  // ═══════════════════════════════════════════════════════════════════

  describe('listModels', () => {
    it('should reject non-admin', async () => {
      await expect(modelService.listModels(makeCurrentUser())).rejects.toThrow(ForbiddenException);
    });

    it('should return all non-deleted models', async () => {
      mockInferenceRepo.listAllModels.mockResolvedValue([
        makeModel(),
        makeModel({ id: 'model-2' }),
      ]);
      const result = await modelService.listModels(makeAdminUser());
      expect(result).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model update
  // ═══════════════════════════════════════════════════════════════════

  describe('updateModel', () => {
    it('should update name and description', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      mockInferenceRepo.updateModel.mockResolvedValue(
        makeModel({ name: 'New Name', description: 'Updated' }),
      );

      const result = await modelService.updateModel(
        'model-uuid-1',
        { name: 'New Name', description: 'Updated' },
        makeAdminUser(),
      );

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('Updated');
    });

    it('should reject non-admin', async () => {
      await expect(
        modelService.updateModel('model-uuid-1', { name: 'x' }, makeCurrentUser()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model activate/deactivate
  // ═══════════════════════════════════════════════════════════════════

  describe('setActiveModel', () => {
    it('should activate a ready model', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ active: false }));
      mockInferenceRepo.updateModel.mockResolvedValue(makeModel({ active: true }));

      const result = await modelService.setActiveModel(
        'model-uuid-1',
        { active: true },
        makeAdminUser(),
      );

      expect(result.active).toBe(true);
    });

    it('should reject activating non-ready model', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(
        makeModel({ status: 'uploading', active: false }),
      );

      await expect(
        modelService.setActiveModel('model-uuid-1', { active: true }, makeAdminUser()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deactivate a ready model', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ active: true }));
      mockInferenceRepo.updateModel.mockResolvedValue(makeModel({ active: false }));

      const result = await modelService.setActiveModel(
        'model-uuid-1',
        { active: false },
        makeAdminUser(),
      );

      expect(result.active).toBe(false);
    });

    it('should reject non-admin', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      await expect(
        modelService.setActiveModel('model-uuid-1', { active: true }, makeCurrentUser()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model delete
  // ═══════════════════════════════════════════════════════════════════

  describe('deleteModel', () => {
    it('should reject if model is active', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ active: true }));

      await expect(modelService.deleteModel('model-uuid-1', makeAdminUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject if model has active jobs', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ active: false }));
      mockInferenceRepo.hasActiveJobsForModel.mockResolvedValue(true);

      await expect(modelService.deleteModel('model-uuid-1', makeAdminUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should soft-delete model and enqueue object deletion', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ active: false }));
      mockInferenceRepo.hasActiveJobsForModel.mockResolvedValue(false);
      mockInferenceRepo.softDeleteModel.mockResolvedValue(makeModel({ active: false }));

      const result = await modelService.deleteModel('model-uuid-1', makeAdminUser());

      expect(result).toBeDefined();
      expect(mockInferenceRepo.softDeleteModel).toHaveBeenCalledWith('model-uuid-1', {
        actorUserId: makeAdminUser().sub,
        metadata: { objectKey: 'models/model-uuid-1/best.pt' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  listActiveModels (user)
  // ═══════════════════════════════════════════════════════════════════

  describe('listActiveModels', () => {
    it('should return active ready models', async () => {
      mockInferenceRepo.listActiveModels.mockResolvedValue([makeModel()]);
      const result = await modelService.listActiveModels();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('model-uuid-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Job creation
  // ═══════════════════════════════════════════════════════════════════

  describe('createJob', () => {
    it('should reject if model not found', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(undefined);
      await expect(
        jobService.createJob(
          { modelId: 'bad-model', uploadId: 'upload-uuid-1' },
          makeCurrentUser(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if model not ready', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel({ status: 'uploading' }));
      await expect(
        jobService.createJob(
          { modelId: 'model-uuid-1', uploadId: 'upload-uuid-1' },
          makeCurrentUser(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create upload-sourced job with access check', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      mockUploadsRepo.findByIdAnyStatus.mockResolvedValue(makeUpload());
      mockUploadsRepo.findFilesByUploadId.mockResolvedValue([
        {
          id: 'f1',
          variant: 'original',
          imageIndex: 0,
          objectKey: 'uploads/u1/0/original.jpg',
          observedEtag: 'etag-0',
          sizeBytes: 100,
        },
        {
          id: 'f2',
          variant: 'original',
          imageIndex: 1,
          objectKey: 'uploads/u1/1/original.jpg',
          observedEtag: 'etag-1',
          sizeBytes: 100,
        },
        { id: 'f3', variant: 'preview', imageIndex: 0, objectKey: 'preview.jpg' },
      ]);
      mockInferenceRepo.createJobWithImages.mockResolvedValue(makeJob());

      const result = await jobService.createJob(
        { modelId: 'model-uuid-1', uploadId: 'upload-uuid-1' },
        makeCurrentUser(),
      );

      expect(result.id).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.imageCount).toBe(2);
      expect(mockUploadsRepo.findByIdAnyStatus).toHaveBeenCalledWith('upload-uuid-1');
    });

    it('should filter by imageIndexes when provided', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      mockUploadsRepo.findByIdAnyStatus.mockResolvedValue(makeUpload());
      mockUploadsRepo.findFilesByUploadId.mockResolvedValue([
        {
          id: 'f1',
          variant: 'original',
          imageIndex: 0,
          objectKey: 'uploads/u1/0/original.jpg',
          observedEtag: 'etag-0',
          sizeBytes: 100,
        },
        {
          id: 'f2',
          variant: 'original',
          imageIndex: 1,
          objectKey: 'uploads/u1/1/original.jpg',
          observedEtag: 'etag-1',
          sizeBytes: 100,
        },
      ]);
      mockInferenceRepo.createJobWithImages.mockResolvedValue(makeJob({ imageCount: 1 }));

      const result = await jobService.createJob(
        { modelId: 'model-uuid-1', uploadId: 'upload-uuid-1', imageIndexes: [0] },
        makeCurrentUser(),
      );

      expect(result.imageCount).toBe(1);
    });

    it('should preserve original imageIndex and fallback filename for non-zero selected index', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      mockUploadsRepo.findByIdAnyStatus.mockResolvedValue(makeUpload());
      mockUploadsRepo.findFilesByUploadId.mockResolvedValue([
        {
          id: 'f0',
          variant: 'original',
          imageIndex: 0,
          objectKey: 'uploads/u1/0/original.jpg',
          observedEtag: 'etag-0',
          sizeBytes: 100,
        },
        {
          id: 'f1',
          variant: 'original',
          imageIndex: 1,
          objectKey: 'uploads/u1/1/original.jpg',
          observedEtag: 'etag-1',
          sizeBytes: 100,
        },
        {
          id: 'f2',
          variant: 'original',
          imageIndex: 2,
          objectKey: 'uploads/u1/2/original.jpg',
          observedEtag: 'etag-2',
          sizeBytes: 100,
        },
      ]);

      mockInferenceRepo.createJobWithImages.mockResolvedValue(makeJob({ imageCount: 1 }));

      const result = await jobService.createJob(
        { modelId: 'model-uuid-1', uploadId: 'upload-uuid-1', imageIndexes: [1] },
        makeCurrentUser(),
      );

      expect(result.imageCount).toBe(1);
      expect(mockInferenceRepo.createUploadJobWithFence).toHaveBeenCalledWith(
        expect.anything(),
        [expect.objectContaining({ imageIndex: 1, fileName: 'original.jpg' })],
        expect.anything(),
        expect.objectContaining({ actorUserId: 'user-uuid-1' }),
      );
    });

    it('should create temporary job with presigned URLs', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      mockStorageService.getPresignedPutUrl.mockResolvedValue({
        url: 'https://upload.url',
        expiresAt: new Date(),
        objectKey: 'inference/user-uuid-1/job-1/0/original.jpg',
        method: 'PUT',
        headers: {},
      });
      mockInferenceRepo.createJobWithImages.mockResolvedValue(
        makeJob({ status: 'uploading', sourceType: 'temporary' }),
      );

      const result = await jobService.createJob(
        {
          modelId: 'model-uuid-1',
          files: [{ fileName: 'img.jpg', contentType: 'image/jpeg', sizeBytes: 1000 }],
        },
        makeCurrentUser(),
      );

      expect(result.status).toBe('uploading');
      expect(result.files).toBeDefined();
      expect(result.files!.length).toBe(1);
      expect(result.files![0].headers).toBeDefined();
    });

    it('should validate max files for temporary jobs', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      const manyFiles = Array.from({ length: 21 }, (_, i) => ({
        fileName: `img${i}.jpg`,
        contentType: 'image/jpeg' as const,
        sizeBytes: 1000,
      }));

      await expect(
        jobService.createJob({ modelId: 'model-uuid-1', files: manyFiles }, makeCurrentUser()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate file size for temporary jobs', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      await expect(
        jobService.createJob(
          {
            modelId: 'model-uuid-1',
            files: [
              { fileName: 'big.jpg', contentType: 'image/jpeg', sizeBytes: 999 * 1024 * 1024 },
            ],
          },
          makeCurrentUser(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate content types for temporary jobs', async () => {
      mockInferenceRepo.findModelById.mockResolvedValue(makeModel());
      await expect(
        jobService.createJob(
          {
            modelId: 'model-uuid-1',
            // Intentionally invalid content type: rejected at runtime validation.
            files: [
              {
                fileName: 'bad.txt',
                contentType: 'text/plain',
                sizeBytes: 1000,
              } as unknown as { fileName: string; contentType: 'image/jpeg'; sizeBytes: number },
            ],
          },
          makeCurrentUser(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Complete temporary job
  // ═══════════════════════════════════════════════════════════════════

  describe('completeTemporaryJob', () => {
    it('should reject non-temporary jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ sourceType: 'upload' }));
      await expect(
        jobService.completeTemporaryJob('job-uuid-1', makeCurrentUser()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-owner', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({
          sourceType: 'temporary',
          userId: 'other-user',
          status: 'uploading',
        }),
      );
      await expect(
        jobService.completeTemporaryJob('job-uuid-1', makeCurrentUser()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should HEAD all images and transition to queued', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({
          sourceType: 'temporary',
          status: 'uploading',
        }),
      );
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([
        { id: 'img-1', imageIndex: 0, sourceObjectKey: 'key1', fileName: 'f1' },
        { id: 'img-2', imageIndex: 1, sourceObjectKey: 'key2', fileName: 'f2' },
      ]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 100,
        etag: 'etag-1',
      });
      mockInferenceRepo.sealAndCompleteTemporaryJob.mockResolvedValue(
        makeJob({
          sourceType: 'temporary',
          status: 'queued',
        }),
      );

      const result = await jobService.completeTemporaryJob('job-uuid-1', makeCurrentUser());

      expect(result.status).toBe('queued');
      expect(mockStorageService.headObject).toHaveBeenCalledTimes(2);
    });

    it('should throw on any missing image without mutating', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({
          sourceType: 'temporary',
          status: 'uploading',
        }),
      );
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([
        { id: 'img-1', imageIndex: 0, sourceObjectKey: 'key1', fileName: 'f1' },
      ]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });

      await expect(
        jobService.completeTemporaryJob('job-uuid-1', makeCurrentUser()),
      ).rejects.toThrow(BadRequestException);

      expect(mockInferenceRepo.failImage).not.toHaveBeenCalled();
    });

    it('should reject non-uploading jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({
          sourceType: 'temporary',
          status: 'queued',
        }),
      );
      await expect(
        jobService.completeTemporaryJob('job-uuid-1', makeCurrentUser()),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Job list/detail
  // ═══════════════════════════════════════════════════════════════════

  describe('listJobs', () => {
    it('should return non-expired jobs for current user', async () => {
      mockInferenceRepo.listJobsByUserId.mockResolvedValue([
        makeJob(),
        makeJob({ id: 'job-2', expiresAt: new Date(Date.now() - 1000) }), // expired
      ]);

      const result = await jobService.listJobs({ limit: 20, offset: 0 }, makeCurrentUser());

      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getJobDetail', () => {
    it('should return job detail with image summaries', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob());
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([
        {
          id: 'img-1',
          imageIndex: 0,
          fileName: 'f1.jpg',
          status: 'completed',
          detections: [{ class: 'weed' }],
          inferenceMs: 150,
        },
      ]);

      const result = await jobService.getJobDetail('job-uuid-1', makeCurrentUser());

      expect(result.images).toHaveLength(1);
      expect(result.images[0].detectionCount).toBe(1);
    });

    it('should reject non-owner non-admin', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ userId: 'other-user' }));
      await expect(jobService.getJobDetail('job-uuid-1', makeCurrentUser())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to view any job', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ userId: 'other-user' }));
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([]);

      const result = await jobService.getJobDetail('job-uuid-1', makeAdminUser());

      expect(result).toBeDefined();
    });

    it('should re-check upload access for upload-sourced jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({ sourceType: 'upload', uploadId: 'upload-uuid-1' }),
      );
      mockUploadsRepo.findByIdAnyStatus.mockResolvedValue(makeUpload({ userId: 'other-user' }));
      mockAccessRepo.hasAnyActiveGrantForUpload.mockResolvedValue(false);
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([]);

      // Non-owner, non-admin, upload not ready → should reject
      await expect(
        jobService.getJobDetail('job-uuid-1', makeCurrentUser({ sub: 'stranger' })),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Image result
  // ═══════════════════════════════════════════════════════════════════

  describe('getImageResult', () => {
    it('should return image result with signed display URL', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob());
      mockUploadsRepo.findByIdAnyStatus.mockResolvedValue(makeUpload());
      mockInferenceRepo.listImagesByJobId.mockResolvedValue([
        {
          id: 'img-1',
          imageIndex: 0,
          fileName: 'f1.jpg',
          sourceObjectKey: 'key1',
          status: 'completed',
          detections: [],
          inferenceMs: 100,
          width: 1920,
          height: 1080,
          errorMessage: null,
        },
      ]);
      mockStorageService.getPresignedGetUrl.mockResolvedValue({
        url: 'https://download.url',
        expiresAt: new Date(),
      });

      const result = await jobService.getImageResult('job-uuid-1', 'img-1', makeCurrentUser());

      expect(result.imageUrl).toBe('https://download.url');
      expect(result.detections).toEqual([]);
      expect(result.errorMessage).toBeNull();
    });

    it('should reject non-owner', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ userId: 'other-user' }));
      await expect(
        jobService.getImageResult('job-uuid-1', 'img-1', makeCurrentUser()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Job deletion
  // ═══════════════════════════════════════════════════════════════════

  describe('deleteJob', () => {
    it('should reject queued jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ status: 'queued' }));
      await expect(jobService.deleteJob('job-uuid-1', makeCurrentUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject running jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ status: 'running' }));
      await expect(jobService.deleteJob('job-uuid-1', makeCurrentUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should delete completed job and enqueue temp object keys', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({ status: 'completed', sourceType: 'temporary' }),
      );
      mockInferenceRepo.deleteJob.mockResolvedValue(
        makeJob({ status: 'completed', sourceType: 'temporary' }),
      );

      const result = await jobService.deleteJob('job-uuid-1', makeCurrentUser());

      expect(result.deleted).toBe(true);
      expect(mockInferenceRepo.deleteJob).toHaveBeenCalledWith('job-uuid-1', {
        actorUserId: makeCurrentUser().sub,
      });
    });

    it('should allow deletion of uploading jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ status: 'uploading' }));
      mockInferenceRepo.deleteJob.mockResolvedValue(makeJob({ status: 'uploading' }));

      const result = await jobService.deleteJob('job-uuid-1', makeCurrentUser());

      expect(result.deleted).toBe(true);
    });

    it('should allow deletion of failed jobs', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ status: 'failed' }));
      mockInferenceRepo.deleteJob.mockResolvedValue(makeJob({ status: 'failed' }));

      const result = await jobService.deleteJob('job-uuid-1', makeCurrentUser());

      expect(result.deleted).toBe(true);
    });

    it('should reject deletion when the job starts running concurrently', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(makeJob({ status: 'uploading' }));
      mockInferenceRepo.deleteJob.mockResolvedValue(undefined);

      await expect(jobService.deleteJob('job-uuid-1', makeCurrentUser())).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject non-owner', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({ status: 'completed', userId: 'other-user' }),
      );
      await expect(jobService.deleteJob('job-uuid-1', makeCurrentUser())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to delete any job', async () => {
      mockInferenceRepo.findJobById.mockResolvedValue(
        makeJob({ status: 'completed', userId: 'other-user' }),
      );
      mockInferenceRepo.deleteJob.mockResolvedValue(makeJob({ status: 'completed' }));

      const result = await jobService.deleteJob('job-uuid-1', makeAdminUser());

      expect(result.deleted).toBe(true);
    });
  });
});
