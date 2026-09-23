import { Inject, Injectable } from '@nestjs/common';
import { eq, and, or, isNull, SQL, count, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import {
  accessGrants,
  auditEvents,
  uploads,
  properties,
  talhoes,
  cropTypes,
  estadios,
} from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type AccessGrant = InferSelectModel<typeof accessGrants>;
export type NewAccessGrant = InferInsertModel<typeof accessGrants>;

@Injectable()
export class AccessRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  // ── Access grants ────────────────────────────────────────────────

  async createGrant(data: NewAccessGrant, audit?: { actorUserId: string }): Promise<AccessGrant> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(accessGrants).values(data).returning();
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'access_grant',
          actorUserId: audit.actorUserId,
          targetUserId: data.subjectUserId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          after: { actions: row.actions, reason: row.reason },
        });
      return row;
    });
  }

  async findGrantById(id: string): Promise<AccessGrant | undefined> {
    const [row] = await this.db.select().from(accessGrants).where(eq(accessGrants.id, id)).limit(1);
    return row;
  }

  async findActiveGrant(
    subjectUserId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<AccessGrant | undefined> {
    const [row] = await this.db
      .select()
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.subjectUserId, subjectUserId),
          eq(accessGrants.resourceType, resourceType),
          eq(accessGrants.resourceId, resourceId),
          isNull(accessGrants.revokedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /**
   * List access grants with optional filters and pagination.
   * Returns [grants, total] tuple for paginated responses.
   */
  async listFilteredAndCount(options: {
    ownerUserId?: string;
    subjectUserId?: string;
    resourceType?: string;
    resourceId?: string;
    limit: number;
    offset: number;
  }): Promise<[AccessGrant[], number]> {
    const { subjectUserId, resourceType, resourceId, limit, offset } = options;
    const conditions: SQL[] = [];

    if (options.ownerUserId) {
      // Owners see active grants on their live resources; admins also see revoked grants.
      const resources = [
        ['upload', uploads],
        ['property', properties],
        ['talhao', talhoes],
        ['crop_type', cropTypes],
        ['estadio', estadios],
      ] as const;
      conditions.push(
        isNull(accessGrants.revokedAt),
        or(
          ...resources.map(([type, table]) =>
            and(
              eq(accessGrants.resourceType, type),
              sql`EXISTS (SELECT 1 FROM ${table}
            WHERE ${table.id} = ${accessGrants.resourceId}
              AND ${table.userId} = ${options.ownerUserId}
              AND ${table.deletedAt} IS NULL)`,
            ),
          ),
        )!,
      );
    }

    if (subjectUserId) {
      conditions.push(eq(accessGrants.subjectUserId, subjectUserId));
    }
    if (resourceType) {
      conditions.push(eq(accessGrants.resourceType, resourceType));
    }
    if (resourceId) {
      conditions.push(eq(accessGrants.resourceId, resourceId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(accessGrants)
        .where(where)
        .orderBy(accessGrants.grantedAt, accessGrants.id)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(accessGrants).where(where),
    ]);

    return [rows, countResult[0]?.total ?? 0];
  }

  async revokeGrant(
    id: string,
    audit?: { actorUserId: string; grant: AccessGrant },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(accessGrants).set({ revokedAt: new Date() }).where(eq(accessGrants.id, id));
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'access_revoke',
          actorUserId: audit.actorUserId,
          targetUserId: audit.grant.subjectUserId,
          resourceType: audit.grant.resourceType,
          resourceId: audit.grant.resourceId,
          before: { actions: audit.grant.actions, reason: audit.grant.reason },
        });
    });
  }

  /**
   * Check if a user has ANY active grant that would entitle them to view a given upload.
   * Covers direct upload grants plus grants on parent resources (property, talhao, crop_type, estadio).
   * Accepts an optional transaction executor so entitlement checks can run
   * inside a caller's transaction.
   */
  async hasAnyActiveGrantForUpload(
    userId: string,
    uploadResourceIds: {
      uploadId: string;
      propertyId: string;
      talhaoId: string;
      cropTypeId: string;
      estadioId: string | null;
    },
    tx: Pick<DatabaseConnection, 'select'> = this.db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.subjectUserId, userId) as SQL,
          isNull(accessGrants.revokedAt) as SQL,
          or(
            and(
              eq(accessGrants.resourceType, 'upload'),
              eq(accessGrants.resourceId, uploadResourceIds.uploadId),
            ) as SQL,
            and(
              eq(accessGrants.resourceType, 'property'),
              eq(accessGrants.resourceId, uploadResourceIds.propertyId),
            ) as SQL,
            and(
              eq(accessGrants.resourceType, 'talhao'),
              eq(accessGrants.resourceId, uploadResourceIds.talhaoId),
            ) as SQL,
            and(
              eq(accessGrants.resourceType, 'crop_type'),
              eq(accessGrants.resourceId, uploadResourceIds.cropTypeId),
            ) as SQL,
            ...(uploadResourceIds.estadioId
              ? [
                  and(
                    eq(accessGrants.resourceType, 'estadio'),
                    eq(accessGrants.resourceId, uploadResourceIds.estadioId),
                  ) as SQL,
                ]
              : []),
          ) as SQL,
        ) as SQL,
      )
      .limit(1);
    return !!row;
  }
}
