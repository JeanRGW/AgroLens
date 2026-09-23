import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeletionService } from '../../src/worker/deletion.service';
import { JobsRepository } from '../../src/database/repositories';
import { StorageService } from '../../src/storage/storage.service';

describe('DeletionService', () => {
  let service: DeletionService;

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockJobsRepository = {
    pollDeletionJobs: jest.fn(),
    claimDeletionJob: jest.fn(),
    completeDeletionJob: jest.fn().mockResolvedValue(true),
    failDeletionJob: jest.fn().mockResolvedValue('pending'),
  };

  const mockStorageService = {
    deleteObject: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletionService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, def?: unknown) => def) },
        },
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<DeletionService>(DeletionService);
  });

  describe('processNextJob', () => {
    it('should return false when no jobs are available', async () => {
      mockJobsRepository.claimDeletionJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(false);
    });

    it('should return false when job cannot be claimed', async () => {
      mockJobsRepository.pollDeletionJobs.mockResolvedValue([
        {
          id: 'job-1',
          objectKey: 'uploads/key.jpg',
          uploadId: 'upload-1',
          runAfter: new Date(),
          attempts: 0,
          completedAt: null,
          lastError: null,
          createdAt: new Date(),
        },
      ]);
      mockJobsRepository.claimDeletionJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(false);
    });

    it('should delete object and complete job successfully', async () => {
      const job = {
        id: 'job-1',
        objectKey: 'uploads/key.jpg',
        uploadId: 'upload-1',
        runAfter: new Date(),
        attempts: 0,
        completedAt: null,
        lastError: null,
        createdAt: new Date(),
      };
      mockJobsRepository.claimDeletionJob.mockResolvedValue({
        ...job,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockStorageService.deleteObject.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('uploads/key.jpg');
      expect(mockJobsRepository.completeDeletionJob).toHaveBeenCalledWith('job-1', 'token-1');
    });

    it('should handle idempotently missing objects (deleteObject succeeds)', async () => {
      // S3 DeleteObjectCommand succeeds even when the object does not exist
      const job = {
        id: 'job-2',
        objectKey: 'uploads/missing.jpg',
        uploadId: 'upload-1',
        runAfter: new Date(),
        attempts: 0,
        completedAt: null,
        lastError: null,
        createdAt: new Date(),
      };
      mockJobsRepository.claimDeletionJob.mockResolvedValue({
        ...job,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockStorageService.deleteObject.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('uploads/missing.jpg');
      expect(mockJobsRepository.completeDeletionJob).toHaveBeenCalledWith('job-2', 'token-1');
    });

    it('should fail job on storage error', async () => {
      const job = {
        id: 'job-3',
        objectKey: 'uploads/key.jpg',
        uploadId: 'upload-1',
        runAfter: new Date(),
        attempts: 0,
        completedAt: null,
        lastError: null,
        createdAt: new Date(),
      };
      mockJobsRepository.claimDeletionJob.mockResolvedValue({
        ...job,
        attempts: 1,
        lockToken: 'token-1',
      });
      mockStorageService.deleteObject.mockRejectedValue(new Error('Network error'));

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failDeletionJob).toHaveBeenCalledWith(
        'job-3',
        'token-1',
        'Network error',
        3,
      );
    });

    it('should exhaust after max attempts', async () => {
      const job = {
        id: 'job-4',
        objectKey: 'uploads/key.jpg',
        uploadId: 'upload-1',
        runAfter: new Date(),
        attempts: 0,
        completedAt: null,
        lastError: null,
        createdAt: new Date(),
      };
      // Max attempts = 3 (default), so attempts >= 3 means exhausted
      mockJobsRepository.claimDeletionJob.mockResolvedValue({
        ...job,
        attempts: 3,
        lockToken: 'token-1',
      });
      mockStorageService.deleteObject.mockRejectedValue(new Error('Persistent error'));

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(mockJobsRepository.failDeletionJob).toHaveBeenCalledWith(
        'job-4',
        'token-1',
        'Persistent error',
        3,
      );
      // Should not throw — exhaustion is just a log warning
    });
  });
});
