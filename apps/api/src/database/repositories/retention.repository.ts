import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';

export interface RetentionPruneResult {
  refreshTokens: number;
  finalizationJobs: number;
  deletionJobs: number;
  auditEvents: number;
}

/**
 * Prunes expired or terminal records older than the retention window.
 *
 * Every statement is a bounded DELETE guarded by non-active-state predicates
 * (revoked/expired tokens, completed/dead jobs, old rows), so
 * active uploads, pending/running jobs, live sessions, and fresh audit data are
 * never touched.
 */
@Injectable()
export class RetentionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  /** One bounded batch per table per invocation; the next tick drains the remainder. */
  async pruneExpired(retentionCutoff: string, limit: number): Promise<RetentionPruneResult> {
    const refreshTokens = await this.deleteCapped(
      sql`DELETE FROM refresh_tokens WHERE id IN (
        SELECT id FROM refresh_tokens
        WHERE expires_at <= ${retentionCutoff}::timestamptz OR revoked_at <= ${retentionCutoff}::timestamptz
        ORDER BY expires_at LIMIT ${limit}
      ) RETURNING 1`,
    );
    const finalizationJobs = await this.deleteCapped(
      // completed_at records either terminal outcome. Legacy dead jobs without
      // a terminal timestamp stay recoverable instead of being aged from creation.
      sql`DELETE FROM upload_finalization_jobs WHERE id IN (
        SELECT id FROM upload_finalization_jobs
        WHERE status IN ('completed', 'dead')
          AND completed_at <= ${retentionCutoff}::timestamptz
        ORDER BY created_at LIMIT ${limit}
      ) RETURNING 1`,
    );
    const deletionJobs = await this.deleteCapped(
      sql`DELETE FROM object_deletion_jobs WHERE id IN (
        SELECT id FROM object_deletion_jobs
        WHERE status = 'completed'
          AND completed_at <= ${retentionCutoff}::timestamptz
        ORDER BY created_at LIMIT ${limit}
      ) RETURNING 1`,
    );
    const auditEvents = await this.deleteCapped(
      sql`DELETE FROM audit_events WHERE id IN (
        SELECT id FROM audit_events WHERE created_at <= ${retentionCutoff}::timestamptz
        ORDER BY created_at LIMIT ${limit}
      ) RETURNING 1`,
    );

    return {
      refreshTokens,
      finalizationJobs,
      deletionJobs,
      auditEvents,
    };
  }

  private async deleteCapped(statement: ReturnType<typeof sql>): Promise<number> {
    const rows = (await this.db.execute(statement)) as unknown as Array<unknown>;
    return rows.length;
  }
}
