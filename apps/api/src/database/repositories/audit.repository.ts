import { Inject, Injectable } from '@nestjs/common';
import { eq, and, desc, gte, lte, count, inArray, SQL, getTableColumns } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import {
  auditEvents,
  users,
  properties,
  talhoes,
  cropTypes,
  estadios,
  inferenceModels,
} from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type AuditEvent = InferSelectModel<typeof auditEvents>;
export type NewAuditEvent = InferInsertModel<typeof auditEvents>;
export type AuditTransaction = Omit<DatabaseConnection, 'transaction'>;

/** Audit row with actor/target display names resolved (null when the user is gone). */
export interface EnrichedAuditEvent extends AuditEvent {
  actorName: string | null;
  targetName: string | null;
}

export interface AuditFindManyOptions {
  actorUserId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  eventType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  async create(data: NewAuditEvent, db: AuditTransaction = this.db): Promise<AuditEvent> {
    const [row] = await db.insert(auditEvents).values(data).returning();
    return row;
  }

  async findById(id: string): Promise<AuditEvent | undefined> {
    const [row] = await this.db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
    return row;
  }

  /**
   * Combined filtered query for audit events.
   * All filters are optional; only provided ones are applied as AND conditions.
   * Results are ordered by createdAt descending with pagination.
   * Actor/target user names are resolved via LEFT JOINs (null when the user
   * no longer exists). Returns [events, total] tuple for paginated responses.
   */
  async findMany(options: AuditFindManyOptions = {}): Promise<[EnrichedAuditEvent[], number]> {
    const {
      actorUserId,
      targetUserId,
      resourceType,
      resourceId,
      eventType,
      dateFrom,
      dateTo,
      limit = 100,
      offset = 0,
    } = options;

    const conditions: SQL[] = [];

    if (actorUserId) conditions.push(eq(auditEvents.actorUserId, actorUserId));
    if (targetUserId) conditions.push(eq(auditEvents.targetUserId, targetUserId));
    if (resourceType) conditions.push(eq(auditEvents.resourceType, resourceType));
    if (resourceId) conditions.push(eq(auditEvents.resourceId, resourceId));
    if (eventType) conditions.push(eq(auditEvents.eventType, eventType));
    if (dateFrom) conditions.push(gte(auditEvents.createdAt, dateFrom));
    if (dateTo) conditions.push(lte(auditEvents.createdAt, dateTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const actor = alias(users, 'audit_actor');
    const target = alias(users, 'audit_target');
    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(auditEvents),
          actorName: actor.fullName,
          targetName: target.fullName,
        })
        .from(auditEvents)
        .leftJoin(actor, eq(auditEvents.actorUserId, actor.id))
        .leftJoin(target, eq(auditEvents.targetUserId, target.id))
        .where(where)
        .orderBy(desc(auditEvents.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(auditEvents).where(where),
    ]);

    return [rows, countResult[0]?.total ?? 0];
  }

  /**
   * Batch-resolve human-readable names for audit resource references.
   * Covers catalog entities and inference models. Uploads and files have no
   * human name, so callers display their (truncated) id instead.
   * Returns a map keyed by `${resourceType}:${resourceId}`. Unresolvable
   * references (deleted rows, jobs, token families, non-UUID ids like
   * `batch`) are simply absent so callers fall back to the raw id.
   */
  async findResourceNames(
    requests: Array<{ resourceType: string | null; resourceId: string | null }>,
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const key = (type: string, id: string) => `${type}:${id}`;
    const idsByType = new Map<string, Set<string>>();

    for (const { resourceType, resourceId } of requests) {
      if (!resourceType || !resourceId || !isUuid(resourceId)) continue;

      const ids = idsByType.get(resourceType) ?? new Set<string>();
      ids.add(resourceId);
      idsByType.set(resourceType, ids);
    }

    const catalogLookups = [
      { type: 'property', table: properties },
      { type: 'talhao', table: talhoes },
      { type: 'crop_type', table: cropTypes },
      { type: 'estadio', table: estadios },
    ] as const;

    await Promise.all([
      ...catalogLookups.map(async ({ type, table }) => {
        const ids = [...(idsByType.get(type) ?? [])];
        if (ids.length === 0) return;

        const rows = await this.db
          .select({ id: table.id, name: table.name })
          .from(table)
          .where(inArray(table.id, ids));
        for (const row of rows) names.set(key(type, row.id), row.name);
      }),
      (async () => {
        const ids = [...(idsByType.get('inference_model') ?? [])];
        if (ids.length === 0) return;

        const rows = await this.db
          .select({
            id: inferenceModels.id,
            name: inferenceModels.name,
          })
          .from(inferenceModels)
          .where(inArray(inferenceModels.id, ids));
        for (const row of rows) {
          names.set(key('inference_model', row.id), row.name);
        }
      })(),
    ]);

    return names;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}
