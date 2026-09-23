import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminJobsService } from '../../src/worker/admin-jobs.service';
import { JobsRepository, AuditRepository } from '../../src/database/repositories';
import type { AuthenticatedUser } from '../../src/auth/guards/jwt-auth.guard';

function makeAdmin(): AuthenticatedUser {
  return {
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'admin',
    userRecord: {
      id: 'admin-uuid-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      phone: null,
      role: 'admin',
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe('AdminJobsService', () => {
  let service: AdminJobsService;

  const mockJobsRepository = {
    listDeadJobs: jest.fn(),
    retryDeadDeletionJob: jest.fn(),
    retryDeadFinalizationJob: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Fresh default outcomes per test; individual tests override as needed.
    mockJobsRepository.retryDeadDeletionJob.mockResolvedValue({ found: true, retried: true });
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({ status: 'requeued' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminJobsService,
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: AuditRepository, useValue: mockAuditRepository },
      ],
    }).compile();

    service = module.get<AdminJobsService>(AdminJobsService);
  });

  it('should list dead jobs from both queues', async () => {
    mockJobsRepository.listDeadJobs.mockResolvedValue([
      { queue: 'upload_finalization', id: 'job-1' },
      { queue: 'object_deletion', id: 'job-2' },
    ]);

    const result = await service.listDeadJobs();

    expect(result).toHaveLength(2);
    expect(mockJobsRepository.listDeadJobs).toHaveBeenCalledWith(100);
  });

  it('should requeue a dead object_deletion job and audit the retry', async () => {
    mockJobsRepository.retryDeadDeletionJob.mockResolvedValue({ found: true, retried: true });

    await service.retryDeadJob('object_deletion', 'job-2', makeAdmin());

    expect(mockJobsRepository.retryDeadDeletionJob).toHaveBeenCalledWith('job-2');
    expect(mockJobsRepository.retryDeadFinalizationJob).not.toHaveBeenCalled();
    expect(mockAuditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'dead_job_retry', resourceId: 'job-2' }),
    );
  });

  it('should restore the upload and requeue a dead upload_finalization job', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({ status: 'requeued' });

    await service.retryDeadJob('upload_finalization', 'job-1', makeAdmin());

    expect(mockJobsRepository.retryDeadFinalizationJob).toHaveBeenCalledWith('job-1');
    expect(mockAuditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'dead_job_retry', resourceId: 'job-1' }),
    );
  });

  it('should throw NotFoundException when the finalization job does not exist', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({ status: 'not_found' });

    await expect(
      service.retryDeadJob('upload_finalization', 'missing', makeAdmin()),
    ).rejects.toThrow(NotFoundException);
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when the finalization job is not dead (idempotency)', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({ status: 'not_dead' });

    await expect(
      service.retryDeadJob('upload_finalization', 'running-job', makeAdmin()),
    ).rejects.toThrow(ConflictException);
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when the upload moved on from the failed state', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({
      status: 'upload_not_retryable',
      uploadStatus: 'ready',
    });

    await expect(service.retryDeadJob('upload_finalization', 'job-1', makeAdmin())).rejects.toThrow(
      /"ready" status and cannot be restored/,
    );
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when another active finalization job already exists', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({
      status: 'active_job_exists',
    });

    await expect(service.retryDeadJob('upload_finalization', 'job-1', makeAdmin())).rejects.toThrow(
      /active finalization job already exists/,
    );
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when the generic-path job does not exist', async () => {
    mockJobsRepository.retryDeadDeletionJob.mockResolvedValue({ found: false, retried: false });

    await expect(service.retryDeadJob('object_deletion', 'missing', makeAdmin())).rejects.toThrow(
      NotFoundException,
    );
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when the generic-path job is not dead (idempotency)', async () => {
    mockJobsRepository.retryDeadDeletionJob.mockResolvedValue({ found: true, retried: false });

    await expect(
      service.retryDeadJob('object_deletion', 'running-job', makeAdmin()),
    ).rejects.toThrow(ConflictException);
    expect(mockAuditRepository.create).not.toHaveBeenCalled();
  });

  it('should not fail the retry when audit recording fails (best effort)', async () => {
    mockJobsRepository.retryDeadFinalizationJob.mockResolvedValue({ status: 'requeued' });
    mockAuditRepository.create.mockRejectedValue(new Error('DB error'));

    await expect(
      service.retryDeadJob('upload_finalization', 'job-1', makeAdmin()),
    ).resolves.toBeUndefined();
  });
});
