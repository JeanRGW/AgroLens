import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull, desc, sql, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { inferenceModels, inferenceJobs, objectDeletionJobs, auditEvents } from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { toCamelCase } from '../database.utils';

export type InferenceModel = InferSelectModel<typeof inferenceModels>;
export type NewInferenceModel = InferInsertModel<typeof inferenceModels>;

export const MAX_VALIDATION_ATTEMPTS = 3;
/** Models stuck in 'validating' for this long are re-eligible for claim. */
const STALE_VALIDATING_MS = 10 * 60 * 1000;

@Injectable()
export class InferenceModelsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
    private readonly config: ConfigService,
  ) {}

  async createModel(
    data: NewInferenceModel,
    audit?: { actorUserId: string; metadata?: unknown },
  ): Promise<InferenceModel> {
    if (!audit) {
      const [row] = await this.db.insert(inferenceModels).values(data).returning();
      return row;
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(inferenceModels).values(data).returning();
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'model_init',
          actorUserId: audit.actorUserId,
          resourceType: 'inference_model',
          resourceId: row.id,
          metadata: audit.metadata,
        });
      return row;
    });
  }

  async findModelById(id: string): Promise<InferenceModel | undefined> {
    const [row] = await this.db
      .select()
      .from(inferenceModels)
      .where(and(eq(inferenceModels.id, id), isNull(inferenceModels.deletedAt)))
      .limit(1);
    return row;
  }

  async listActiveModels(): Promise<InferenceModel[]> {
    return this.db
      .select()
      .from(inferenceModels)
      .where(
        and(
          eq(inferenceModels.status, 'ready'),
          eq(inferenceModels.active, true),
          isNull(inferenceModels.deletedAt),
        ),
      );
  }

  /** List all non-deleted models (admin view). */
  async listAllModels(): Promise<InferenceModel[]> {
    return this.db
      .select()
      .from(inferenceModels)
      .where(isNull(inferenceModels.deletedAt))
      .orderBy(desc(inferenceModels.createdAt), desc(inferenceModels.id));
  }

  async updateModel(
    id: string,
    data: Partial<
      Pick<
        InferenceModel,
        | 'name'
        | 'version'
        | 'description'
        | 'status'
        | 'active'
        | 'task'
        | 'classes'
        | 'sha256'
        | 'sizeBytes'
        | 'errorMessage'
      >
    >,
    audit?: { actorUserId: string; eventType: string; metadata?: unknown },
  ): Promise<InferenceModel | undefined> {
    if (!audit) {
      const [row] = await this.db
        .update(inferenceModels)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(inferenceModels.id, id), isNull(inferenceModels.deletedAt)))
        .returning();
      return row;
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(inferenceModels)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(inferenceModels.id, id), isNull(inferenceModels.deletedAt)))
        .returning();
      if (row && audit) {
        await tx.insert(auditEvents).values({
          eventType: audit.eventType,
          actorUserId: audit.actorUserId,
          resourceType: 'inference_model',
          resourceId: id,
          metadata: audit.metadata,
        });
      }
      return row;
    });
  }

  /** Soft-delete the model and persist its storage cleanup in the same transaction. */
  async softDeleteModel(
    id: string,
    audit?: { actorUserId: string; metadata?: unknown },
  ): Promise<InferenceModel | undefined> {
    return this.db.transaction(async (tx) => {
      const [model] = await tx
        .select()
        .from(inferenceModels)
        .where(and(eq(inferenceModels.id, id), isNull(inferenceModels.deletedAt)))
        .for('update');
      if (!model) return undefined;
      if (model.active)
        throw new ConflictException('Cannot delete an active model. Deactivate it first.');
      const [job] = await tx
        .select({ id: inferenceJobs.id })
        .from(inferenceJobs)
        .where(
          and(
            eq(inferenceJobs.modelId, id),
            sql`${inferenceJobs.status} NOT IN ('completed', 'failed')`,
          ),
        )
        .limit(1);
      if (job) throw new ConflictException('Cannot delete a model with active (non-terminal) jobs');
      const [row] = await tx
        .update(inferenceModels)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(inferenceModels.id, id), isNull(inferenceModels.deletedAt)))
        .returning();
      if (!row) return undefined;
      await tx.insert(objectDeletionJobs).values({
        objectKey: row.objectKey,
        // Previously issued PUT URLs can recreate the object until they expire.
        runAfter: new Date(
          Date.now() + this.config.get<number>('INFERENCE_UPLOAD_EXPIRY_HOURS', 24) * 3600000,
        ),
      });
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'model_delete',
          actorUserId: audit.actorUserId,
          resourceType: 'inference_model',
          resourceId: id,
          metadata: audit.metadata,
        });
      return row;
    });
  }

  /**
   * Atomically claim a validating model for validation.
   */
  async claimValidation(): Promise<InferenceModel | undefined> {
    const staleThreshold = new Date(Date.now() - STALE_VALIDATING_MS).toISOString();
    await this.db.execute(sql`
      UPDATE inference_models
      SET status = 'invalid', updated_at = NOW(),
          error_message = COALESCE(error_message, 'validation lease expired at max attempts')
      WHERE deleted_at IS NULL AND status = 'validating'
        AND validation_attempts >= ${MAX_VALIDATION_ATTEMPTS}
        AND updated_at < ${staleThreshold}::timestamptz
    `);
    const rows = await this.db.execute(sql`
      UPDATE inference_models SET
        validation_attempts = validation_attempts + 1,
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM inference_models
        WHERE deleted_at IS NULL
          AND status = 'validating'
          AND validation_attempts < ${MAX_VALIDATION_ATTEMPTS}
          AND (
            validation_attempts = 0
            OR updated_at < ${staleThreshold}::timestamptz
          )
        ORDER BY validation_attempts ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const mapped = (rows as Record<string, unknown>[]).map(
      (r) => toCamelCase(r) as unknown as InferenceModel,
    );
    return mapped[0];
  }

  /** Reject late results from a reclaimed or reaped validation attempt. */
  async completeValidation(
    id: string,
    attempts: number,
    result: {
      status: 'ready' | 'invalid';
      task?: string;
      classes?: unknown;
      sha256?: string;
      errorMessage: string | null;
    },
  ): Promise<InferenceModel | undefined> {
    const [row] = await this.db
      .update(inferenceModels)
      .set({ ...result, updatedAt: new Date() })
      .where(
        and(
          eq(inferenceModels.id, id),
          eq(inferenceModels.status, 'validating'),
          eq(inferenceModels.validationAttempts, attempts),
          isNull(inferenceModels.deletedAt),
        ),
      )
      .returning();
    return row;
  }

  /**
   * Check whether any non-deleted inference job references a given model
   * in a non-terminal state.
   */
  async hasActiveJobsForModel(modelId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inferenceJobs)
      .where(
        and(
          eq(inferenceJobs.modelId, modelId),
          sql`${inferenceJobs.status} NOT IN ('completed', 'failed')`,
        ),
      )
      .limit(1);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Find model uploads that were never completed (>24h old, still 'uploading').
   */
  async findAbandonedModelUploads(limit = 10): Promise<InferenceModel[]> {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.db
      .select()
      .from(inferenceModels)
      .where(
        and(
          eq(inferenceModels.status, 'uploading'),
          isNull(inferenceModels.deletedAt),
          lt(inferenceModels.createdAt, threshold),
        ),
      )
      .limit(limit);
  }
}
