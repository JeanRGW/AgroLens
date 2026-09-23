import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveRetentionDays } from '../config/env.schema';
import {
  RetentionRepository,
  UploadsRepository,
  type AbandonedCleanupResult,
  type RetentionPruneResult,
} from '../database/repositories';

export interface CleanupSummary {
  drafts: AbandonedCleanupResult;
  failed: AbandonedCleanupResult;
  total: number;
  retention?: RetentionPruneResult;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AbandonedUploadCleanupService {
  private readonly logger = new Logger(AbandonedUploadCleanupService.name);
  private readonly draftExpiryHours: number;
  private readonly failedRetentionDays: number;
  private readonly batchSize: number;
  private readonly retentionDays: number;
  private readonly putUrlTtlMs: number;

  constructor(
    configService: ConfigService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly retentionRepository: RetentionRepository,
  ) {
    this.draftExpiryHours = configService.get<number>('CLEANUP_DRAFT_EXPIRY_HOURS', 24);
    this.failedRetentionDays = configService.get<number>('CLEANUP_FAILED_RETENTION_DAYS', 7);
    this.batchSize = configService.get<number>('CLEANUP_BATCH_SIZE', 20);
    this.putUrlTtlMs = configService.get<number>('UPLOAD_PRESIGNED_URL_TTL_SECONDS', 900) * 1000;
    this.retentionDays = resolveRetentionDays(
      configService.get<number | undefined>('RETENTION_DAYS'),
      configService.get<number | undefined>('INFERENCE_JOB_RETENTION_DAYS'),
    );
  }

  /** Process one bounded batch for each status; the next invocation handles the remainder. */
  async cleanup(now = new Date()): Promise<CleanupSummary> {
    const drafts = await this.uploadsRepository.cleanupAbandoned(
      'draft',
      new Date(now.getTime() - this.draftExpiryHours * 60 * 60 * 1000),
      this.batchSize,
      new Date(now.getTime() + this.putUrlTtlMs),
    );
    const failed = await this.uploadsRepository.cleanupAbandoned(
      'failed',
      new Date(now.getTime() - this.failedRetentionDays * DAY_MS),
      this.batchSize,
      new Date(now.getTime() + this.putUrlTtlMs),
    );
    const retention = await this.retentionRepository.pruneExpired(
      new Date(now.getTime() - this.retentionDays * DAY_MS).toISOString(),
      this.batchSize,
    );
    const summary = {
      drafts,
      failed,
      total: drafts.deleted + failed.deleted,
      retention,
    };
    this.logger.log(`Abandoned upload cleanup: ${JSON.stringify(summary)}`);
    return summary;
  }
}
