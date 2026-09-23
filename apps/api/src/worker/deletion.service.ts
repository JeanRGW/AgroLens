import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsRepository } from '../database/repositories';
import { StorageService } from '../storage/storage.service';
import { sanitizeError } from '../common/sanitize-error';

@Injectable()
export class DeletionService {
  private readonly logger = new Logger(DeletionService.name);
  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly workerId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsRepository: JobsRepository,
    private readonly storageService: StorageService,
  ) {
    this.maxAttempts = this.configService.get<number>('WORKER_DELETION_MAX_ATTEMPTS', 3);
    this.leaseMs = this.configService.get<number>('WORKER_LEASE_MS', 120000);
    this.workerId =
      this.configService.get<string>('WORKER_ID') ??
      `worker-${hostname()}-${process.pid}-${randomUUID()}`;
  }

  /**
   * Process a single deletion job.
   * Called by the worker poll loop.
   * Returns true if a job was processed (success or failure), false if no jobs available.
   */
  async processNextJob(): Promise<boolean> {
    const claimed = await this.jobsRepository.claimDeletionJob(
      this.workerId,
      this.leaseMs,
      this.maxAttempts,
    );
    if (!claimed) return false;
    const job = claimed;
    const pollId = randomUUID();
    const startedAt = performance.now();
    const token = job.lockToken;
    if (!token) throw new Error(`Deletion job ${job.id} was claimed without a lock token`);

    this.logger.log(
      JSON.stringify({
        event: 'job_processing',
        workerId: this.workerId,
        type: 'deletion',
        pollId,
        jobId: job.id,
        attempt: claimed.attempts,
      }),
    );

    try {
      // Delete the object — best-effort for missing keys (S3 DeleteObject is idempotent)
      await this.storageService.deleteObject(job.objectKey);
      if (!(await this.jobsRepository.completeDeletionJob(job.id, token))) return true;
      this.logger.log(
        JSON.stringify({
          event: 'job_completed',
          workerId: this.workerId,
          type: 'deletion',
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
          type: 'deletion',
          pollId,
          jobId: job.id,
          durationMs: Math.round(performance.now() - startedAt),
          error: sanitizeError(error),
        }),
      );

      const outcome = await this.jobsRepository.failDeletionJob(
        job.id,
        token,
        errorMessage,
        this.maxAttempts,
      );

      // Dead jobs are intentionally excluded from future claims.
      if (outcome === 'dead') {
        this.logger.warn(
          JSON.stringify({
            event: 'job_exhausted',
            workerId: this.workerId,
            type: 'deletion',
            pollId,
            jobId: job.id,
            attempts: claimed.attempts,
          }),
        );
      }

      return true; // Job was processed (even if it failed)
    }
  }
}
