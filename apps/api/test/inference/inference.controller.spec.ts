import { Test, TestingModule } from '@nestjs/testing';
import { InferenceController } from '../../src/inference/inference.controller';
import { InferenceJobService } from '../../src/inference/inference-job.service';
import { InferenceModelService } from '../../src/inference/inference-model.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

function makeCurrentUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-uuid-1',
    email: 'owner@example.com',
    role: 'user',
    userRecord: {
      id: 'user-uuid-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      phone: null,
      role: 'user',
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

describe('InferenceController', () => {
  let controller: InferenceController;

  const mockInferenceModelService = {
    listActiveModels: jest.fn(),
  };

  const mockInferenceJobService = {
    createJob: jest.fn(),
    completeTemporaryJob: jest.fn(),
    listJobs: jest.fn(),
    getJobDetail: jest.fn(),
    getImageResult: jest.fn(),
    deleteJob: jest.fn(),
  };

  const mockJwtGuard = { canActivate: jest.fn(() => true) };

  const currentUser = makeCurrentUser();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InferenceController],
      providers: [
        { provide: InferenceModelService, useValue: mockInferenceModelService },
        { provide: InferenceJobService, useValue: mockInferenceJobService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<InferenceController>(InferenceController);
  });

  describe('listActiveModels', () => {
    it('should delegate to service', async () => {
      const expected = [{ id: 'm1', name: 'Model', task: 'detect', classes: [] }];
      mockInferenceModelService.listActiveModels.mockResolvedValue(expected);

      const result = await controller.listActiveModels();
      expect(result).toEqual(expected);
    });
  });

  describe('createJob', () => {
    it('should delegate to service', async () => {
      const dto = { modelId: 'm1', uploadId: 'u1' } as any;
      const expected = { jobId: 'j1', status: 'queued', imageCount: 2 };
      mockInferenceJobService.createJob.mockResolvedValue(expected);

      const result = await controller.createJob(dto, currentUser);
      expect(result).toEqual(expected);
      expect(mockInferenceJobService.createJob).toHaveBeenCalledWith(dto, currentUser);
    });
  });

  describe('completeTemporaryJob', () => {
    it('should delegate to service', async () => {
      const expected = { jobId: 'j1', status: 'queued' };
      mockInferenceJobService.completeTemporaryJob.mockResolvedValue(expected);

      const result = await controller.completeTemporaryJob('job-uuid-1', currentUser);
      expect(result).toEqual(expected);
    });
  });

  describe('listJobs', () => {
    it('should delegate to service', async () => {
      const dto = { limit: 20, offset: 0 } as any;
      const expected = { jobs: [], total: 0, limit: 20, offset: 0 };
      mockInferenceJobService.listJobs.mockResolvedValue(expected);

      const result = await controller.listJobs(dto, currentUser);
      expect(result).toEqual(expected);
    });
  });

  describe('getJobDetail', () => {
    it('should delegate to service', async () => {
      const expected = { id: 'j1', images: [] };
      mockInferenceJobService.getJobDetail.mockResolvedValue(expected as any);

      const result = await controller.getJobDetail('job-uuid-1', currentUser);
      expect(result).toEqual(expected);
    });
  });

  describe('getImageResult', () => {
    it('should delegate to service', async () => {
      const expected = { id: 'img-1', displayUrl: 'https://...' };
      mockInferenceJobService.getImageResult.mockResolvedValue(expected as any);

      const result = await controller.getImageResult('job-uuid-1', 'img-uuid-1', currentUser);
      expect(result).toEqual(expected);
    });
  });

  describe('deleteJob', () => {
    it('should delegate to service', async () => {
      const expected = { deleted: true };
      mockInferenceJobService.deleteJob.mockResolvedValue(expected);

      const result = await controller.deleteJob('job-uuid-1', currentUser);
      expect(result).toEqual(expected);
    });
  });
});
