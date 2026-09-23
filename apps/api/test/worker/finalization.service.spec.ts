import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FinalizationService } from '../../src/worker/finalization.service';
import { UploadsRepository, JobsRepository } from '../../src/database/repositories';
import type { Upload, UploadFile } from '../../src/database/repositories';
import { StorageService } from '../../src/storage/storage.service';
import { ImageProcessingService } from '../../src/image-processing/image-processing.service';
import { DATABASE_CONNECTION } from '../../src/database/database.constants';

// ── Helpers ──────────────────────────────────────────────────────────

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 'upload-uuid-1',
    clientUploadId: 'client-upload-1',
    userId: 'user-uuid-1',
    propertyId: 'prop-uuid-1',
    talhaoId: 'talhao-uuid-1',
    cropTypeId: 'crop-uuid-1',
    estadioId: null,
    source: 'phone',
    status: 'finalizing',
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

function makeUploadFile(overrides: Partial<UploadFile> = {}): UploadFile {
  return {
    id: 'file-uuid-1',
    uploadId: 'upload-uuid-1',
    imageIndex: 0,
    variant: 'original',
    objectKey: 'staging/uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
    contentType: 'image/jpeg',
    sizeBytes: null,
    observedEtag: 'etag-1',
    width: null,
    height: null,
    createdAt: new Date('2025-06-15'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('FinalizationService', () => {
  let service: FinalizationService;

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockUploadsRepository = {
    findByIdAnyStatus: jest.fn(),
    findFilesByUploadId: jest.fn(),
    upsertFile: jest.fn(),
  };

  const mockJobsRepository = {
    pollFinalizationJobs: jest.fn(),
    claimFinalizationJob: jest.fn(),
    touchFinalizationJob: jest.fn().mockResolvedValue(true),
    completeFinalizationAndUpload: jest.fn().mockResolvedValue(true),
    failFinalizationAndUpload: jest.fn().mockResolvedValue('pending'),
  };

  const mockStorageService = {
    headObject: jest.fn(),
    getObjectBufferBounded: jest.fn(),
    putObject: jest.fn(),
  };

  const mockImageProcessingService = {
    probeImage: jest.fn(),
    generatePreview: jest.fn(),
  };

  const mockDb = {
    transaction: jest.fn(),
    execute: jest.fn().mockResolvedValue([{ id: 'owned' }]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));

    mockJobsRepository.claimFinalizationJob.mockReset();
    mockJobsRepository.touchFinalizationJob.mockReset();
    mockJobsRepository.touchFinalizationJob.mockResolvedValue(true);
    mockJobsRepository.completeFinalizationAndUpload.mockReset();
    mockJobsRepository.completeFinalizationAndUpload.mockResolvedValue(true);
    mockJobsRepository.failFinalizationAndUpload.mockReset();
    mockJobsRepository.failFinalizationAndUpload.mockResolvedValue('pending');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinalizationService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, def?: unknown) => def) },
        },
        { provide: UploadsRepository, useValue: mockUploadsRepository },
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ImageProcessingService, useValue: mockImageProcessingService },
        { provide: DATABASE_CONNECTION, useValue: mockDb },
      ],
    }).compile();

    service = module.get<FinalizationService>(FinalizationService);
  });

  describe('processNextJob', () => {
    it('should return false when no jobs are available', async () => {
      mockJobsRepository.claimFinalizationJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(false);
    });

    it('should return false when job cannot be claimed', async () => {
      mockJobsRepository.claimFinalizationJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(false);
    });

    it('should successfully finalize an upload', async () => {
      const upload = makeUpload();
      const originalFile = makeUploadFile();
      const previewBuffer = Buffer.from('preview-data');
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([originalFile]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 1024,
        contentType: 'image/jpeg',
        etag: 'etag-1',
      });
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockImageProcessingService.probeImage.mockResolvedValue({
        contentType: 'image/jpeg',
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });
      mockImageProcessingService.generatePreview.mockResolvedValue({
        buffer: previewBuffer,
        contentType: 'image/jpeg',
        width: 1200,
        height: 675,
      });
      mockStorageService.putObject.mockResolvedValue({ etag: '"abc123"' });

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockStorageService.headObject).toHaveBeenCalledWith(originalFile.objectKey);
      expect(mockStorageService.getObjectBufferBounded).toHaveBeenCalledWith(
        originalFile.objectKey,
        100 * 1024 * 1024,
        'etag-1',
      );
      expect(mockImageProcessingService.probeImage).toHaveBeenCalled();
      expect(mockImageProcessingService.generatePreview).toHaveBeenCalled();
      expect(mockStorageService.putObject).toHaveBeenCalledWith(
        'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
        Buffer.from('image-data'),
        'image/jpeg',
      );
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          objectKey: 'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
          observedEtag: 'abc123',
        }),
      );
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          objectKey: originalFile.objectKey,
          runAfter: expect.any(Date),
        }),
      );
      expect(mockStorageService.putObject).toHaveBeenCalledWith(
        expect.stringContaining('preview.jpg'),
        previewBuffer,
        'image/jpeg',
      );
      expect(mockJobsRepository.completeFinalizationAndUpload).toHaveBeenCalledWith(
        'job-1',
        upload.id,
        'token-1',
      );
    });

    it('should fail job when original object is missing', async () => {
      const upload = makeUpload();
      const originalFile = makeUploadFile();
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([originalFile]);
      mockStorageService.headObject.mockResolvedValue({ exists: false });

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failFinalizationAndUpload).toHaveBeenCalledWith(
        'job-1',
        upload.id,
        'token-1',
        expect.stringContaining('not found in storage'),
        3,
      );
      expect(mockJobsRepository.failFinalizationAndUpload.mock.calls[0][3]).not.toContain(
        'uploads/user-uuid-1/upload-uuid-1/0/original.jpg',
      );
    });

    it('should fail job and mark upload as failed after max attempts', async () => {
      const upload = makeUpload();
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 3, // max attempts reached
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([]);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failFinalizationAndUpload).toHaveBeenCalledWith(
        'job-1',
        upload.id,
        'token-1',
        expect.any(String),
        3,
      );
    });

    it('should fail job when upload is not in finalizing status', async () => {
      const upload = makeUpload({ status: 'draft' });
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failFinalizationAndUpload).toHaveBeenCalledWith(
        'job-1',
        upload.id,
        'token-1',
        expect.stringContaining('expected "finalizing"'),
        3,
      );
    });

    it('should fail job when image probe detects unsupported format', async () => {
      const upload = makeUpload();
      const originalFile = makeUploadFile();
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([originalFile]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 1024,
      });
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('gif-data'));
      mockImageProcessingService.probeImage.mockRejectedValue(
        new Error('Unsupported image format: gif'),
      );

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failFinalizationAndUpload).toHaveBeenCalledWith(
        'job-1',
        upload.id,
        'token-1',
        expect.stringContaining('Unsupported image format'),
        3,
      );
    });

    it('should process multiple originals for a single upload', async () => {
      const upload = makeUpload();
      const file1 = makeUploadFile({ id: 'file-1', imageIndex: 0 });
      const file2 = makeUploadFile({
        id: 'file-2',
        imageIndex: 1,
        objectKey: 'uploads/user-uuid-1/upload-uuid-1/1/original.png',
      });
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([file1, file2]);
      mockStorageService.headObject.mockResolvedValue({
        exists: true,
        contentLength: 1024,
      });
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockImageProcessingService.probeImage.mockResolvedValue({
        contentType: 'image/jpeg',
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });
      mockImageProcessingService.generatePreview.mockResolvedValue({
        buffer: Buffer.from('preview'),
        contentType: 'image/jpeg',
        width: 1200,
        height: 675,
      });
      mockStorageService.putObject.mockResolvedValue({ etag: '"abc"' });

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockStorageService.headObject).toHaveBeenCalledTimes(2);
      expect(mockStorageService.putObject).toHaveBeenCalledTimes(4);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalledTimes(2);
      expect(mockJobsRepository.touchFinalizationJob).toHaveBeenCalledTimes(2);
      expect(mockJobsRepository.touchFinalizationJob).toHaveBeenCalledWith('job-1', 'token-1');
    });

    it('should abort and skip completion when touchFinalizationJob indicates lease was lost', async () => {
      const upload = makeUpload();
      const file1 = makeUploadFile({ id: 'file-1', imageIndex: 0 });
      const file2 = makeUploadFile({ id: 'file-2', imageIndex: 1 });
      mockJobsRepository.claimFinalizationJob.mockResolvedValue({
        id: 'job-1',
        uploadId: upload.id,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockUploadsRepository.findByIdAnyStatus.mockResolvedValue(upload);
      mockUploadsRepository.findFilesByUploadId.mockResolvedValue([file1, file2]);
      mockStorageService.headObject.mockResolvedValue({ exists: true, contentLength: 1024 });
      mockStorageService.getObjectBufferBounded.mockResolvedValue(Buffer.from('image-data'));
      mockImageProcessingService.probeImage.mockResolvedValue({
        contentType: 'image/jpeg',
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });
      mockImageProcessingService.generatePreview.mockResolvedValue({
        buffer: Buffer.from('preview'),
        contentType: 'image/jpeg',
        width: 1200,
        height: 675,
      });
      mockStorageService.putObject.mockResolvedValue({ etag: '"abc"' });

      // First file touch succeeds, second returns false (or first returns false immediately)
      mockJobsRepository.touchFinalizationJob.mockResolvedValueOnce(false);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      // No image work starts once the lease is lost.
      expect(mockStorageService.headObject).not.toHaveBeenCalled();
      expect(mockJobsRepository.completeFinalizationAndUpload).not.toHaveBeenCalled();
      expect(mockJobsRepository.failFinalizationAndUpload).not.toHaveBeenCalled();
    });
  });
});
