import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobsRepository, AuditRepository } from '../database/repositories';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

export type DeadJobQueue = 'upload_finalization' | 'object_deletion';

/**
 * Admin-only diagnosis and recovery for permanently failed worker jobs.
 *
 * Recovery is deliberately operator-gated and audited: a job is only requeued
 * after the underlying issue has been corrected, and each retry is recorded as
 * a `dead_job_retry` audit event. Requeuing clears the attempt counter so the
 * job is claimable again.
 *
 * Upload finalization retries restore both the failed upload status and the
 * job. Object deletion jobs stay generic because their work is idempotent.
 */
@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly auditRepository: AuditRepository,
  ) {}

  async listDeadJobs(): Promise<Array<Record<string, unknown>>> {
    return this.jobsRepository.listDeadJobs(100);
  }

  async retryDeadJob(queue: DeadJobQueue, id: string, actor: AuthenticatedUser): Promise<void> {
    if (queue === 'upload_finalization') {
      this.assertRequeued(await this.jobsRepository.retryDeadFinalizationJob(id));
    } else {
      const result = await this.jobsRepository.retryDeadDeletionJob(id);
      if (!result.found) throw new NotFoundException('Job not found');
      if (!result.retried) {
        throw new ConflictException('Job is not in the dead state and was not requeued');
      }
    }

    await this.auditRepository
      .create({
        eventType: 'dead_job_retry',
        actorUserId: actor.sub,
        resourceType: 'job',
        resourceId: id,
        metadata: { queue },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Dead-job retry audit event failed for ${queue}/${id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });

    this.logger.log(`Admin ${actor.email} requeued dead ${queue} job ${id}`);
  }

  private assertRequeued(
    result: Awaited<ReturnType<JobsRepository['retryDeadFinalizationJob']>>,
  ): void {
    switch (result.status) {
      case 'requeued':
        return;
      case 'not_found':
        throw new NotFoundException('Job not found');
      case 'not_dead':
        throw new ConflictException('Job is not in the dead state and was not requeued');
      case 'upload_not_retryable':
        throw new ConflictException(
          `Upload is in "${result.uploadStatus}" status and cannot be restored from a dead finalization job`,
        );
      case 'active_job_exists':
        throw new ConflictException(
          'An active finalization job already exists for this upload and was not requeued',
        );
    }
  }
}
