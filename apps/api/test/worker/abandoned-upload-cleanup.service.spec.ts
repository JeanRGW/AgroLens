import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AbandonedUploadCleanupService } from '../../src/worker/abandoned-upload-cleanup.service';
import { RetentionRepository, UploadsRepository } from '../../src/database/repositories';

describe('AbandonedUploadCleanupService', () => {
  it('uses configured thresholds and one bounded batch per status', async () => {
    const cleanup = jest.fn().mockResolvedValue({ deleted: 2, skipped: 0, enqueuedObjects: 4 });
    const pruneExpired = jest.fn().mockResolvedValue({
      refreshTokens: 2,
      finalizationJobs: 0,
      deletionJobs: 1,
      auditEvents: 3,
    });
    const module = await Test.createTestingModule({
      providers: [
        AbandonedUploadCleanupService,
        { provide: UploadsRepository, useValue: { cleanupAbandoned: cleanup } },
        { provide: RetentionRepository, useValue: { pruneExpired } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, fallback: unknown) =>
                ({
                  CLEANUP_DRAFT_EXPIRY_HOURS: 24,
                  CLEANUP_FAILED_RETENTION_DAYS: 7,
                  CLEANUP_BATCH_SIZE: 3,
                })[key] ?? fallback,
            ),
          },
        },
      ],
    }).compile();
    const service = module.get(AbandonedUploadCleanupService);
    const now = new Date('2026-01-10T00:00:00Z');

    await expect(service.cleanup(now)).resolves.toEqual({
      drafts: { deleted: 2, skipped: 0, enqueuedObjects: 4 },
      failed: { deleted: 2, skipped: 0, enqueuedObjects: 4 },
      total: 4,
      retention: {
        refreshTokens: 2,
        finalizationJobs: 0,
        deletionJobs: 1,
        auditEvents: 3,
      },
    });
    const runAfter = new Date('2026-01-10T00:15:00Z');
    expect(cleanup).toHaveBeenNthCalledWith(
      1,
      'draft',
      new Date('2026-01-09T00:00:00Z'),
      3,
      runAfter,
    );
    expect(cleanup).toHaveBeenNthCalledWith(
      2,
      'failed',
      new Date('2026-01-03T00:00:00Z'),
      3,
      runAfter,
    );
    expect(pruneExpired).toHaveBeenCalledWith('2026-01-03T00:00:00.000Z', 3);
  });

  it('does not continue looping after a bounded invocation', async () => {
    const cleanup = jest.fn().mockResolvedValue({ deleted: 0, skipped: 0, enqueuedObjects: 0 });
    const pruneExpired = jest.fn().mockResolvedValue({
      refreshTokens: 0,
      finalizationJobs: 0,
      deletionJobs: 0,
      auditEvents: 0,
    });
    const module = await Test.createTestingModule({
      providers: [
        AbandonedUploadCleanupService,
        { provide: UploadsRepository, useValue: { cleanupAbandoned: cleanup } },
        { provide: RetentionRepository, useValue: { pruneExpired } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback: unknown) => fallback) },
        },
      ],
    }).compile();

    await module.get(AbandonedUploadCleanupService).cleanup();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(pruneExpired).toHaveBeenCalledTimes(1);
  });

  it('prefers RETENTION_DAYS over the deprecated INFERENCE_JOB_RETENTION_DAYS', async () => {
    const pruneExpired = jest.fn().mockResolvedValue({
      refreshTokens: 0,
      finalizationJobs: 0,
      deletionJobs: 0,
      auditEvents: 0,
    });
    const cleanup = jest.fn().mockResolvedValue({ deleted: 0, skipped: 0, enqueuedObjects: 0 });
    const module = await Test.createTestingModule({
      providers: [
        AbandonedUploadCleanupService,
        { provide: UploadsRepository, useValue: { cleanupAbandoned: cleanup } },
        { provide: RetentionRepository, useValue: { pruneExpired } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, fallback: unknown) =>
                ({ RETENTION_DAYS: 3, INFERENCE_JOB_RETENTION_DAYS: 9 })[key] ?? fallback,
            ),
          },
        },
      ],
    }).compile();

    await module.get(AbandonedUploadCleanupService).cleanup(new Date('2026-01-10T00:00:00Z'));
    expect(pruneExpired).toHaveBeenCalledWith('2026-01-07T00:00:00.000Z', 20);
  });
});
