import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, and, isNull, inArray, asc, desc, sql, getTableColumns, type SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { deriveUploadObjectKeys, namedError } from '../database.utils';
import {
  uploads,
  uploadImages,
  uploadFiles,
  users,
  properties,
  talhoes,
  cropTypes,
  estadios,
  uploadFinalizationJobs,
  objectDeletionJobs,
  auditEvents,
} from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type Upload = InferSelectModel<typeof uploads> & { propertyId: string };
export type NewUpload = InferInsertModel<typeof uploads>;
export type UploadFile = InferSelectModel<typeof uploadFiles> & {
  uploadId: string;
  latitude: number | null;
  longitude: number | null;
};
export type NewUploadFile = InferInsertModel<typeof uploadFiles>;

const fileColumns = {
  ...getTableColumns(uploadFiles),
  uploadId: uploadImages.uploadId,
  latitude: uploadImages.latitude,
  longitude: uploadImages.longitude,
};

const uploadColumns = { ...getTableColumns(uploads), propertyId: talhoes.propertyId };
// INSERT/UPDATE RETURNING cannot join; resolve the same authoritative relationship.
const uploadReturningColumns = {
  ...getTableColumns(uploads),
  propertyId: sql<string>`(SELECT property_id FROM talhoes WHERE id = ${uploads.talhaoId})`,
};

export interface AbandonedCleanupResult {
  deleted: number;
  skipped: number;
  enqueuedObjects: number;
}

/**
 * Enriched upload row returned by listWhereEnriched — includes joined
 * user full name and catalog display names.
 */
export interface EnrichedUploadRow {
  id: string;
  status: string;
  source: string;
  activityDate: Date;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId: string | null;
  userFullName: string | null;
  propertyName: string | null;
  talhaoName: string | null;
  cropTypeName: string | null;
  estadioName: string | null;
}

@Injectable()
export class UploadsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  // ── Upload queries ───────────────────────────────────────────────

  async findById(id: string): Promise<Upload | undefined> {
    const [row] = await this.db
      .select(uploadColumns)
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(and(eq(uploads.id, id), isNull(uploads.deletedAt)))
      .limit(1);
    return row;
  }

  async findByIdAnyStatus(id: string): Promise<Upload | undefined> {
    const [row] = await this.db
      .select(uploadColumns)
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(eq(uploads.id, id))
      .limit(1);
    return row;
  }

  async findByClientUploadId(userId: string, clientUploadId: string): Promise<Upload | undefined> {
    const [row] = await this.db
      .select(uploadColumns)
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(
        and(
          eq(uploads.userId, userId),
          eq(uploads.clientUploadId, clientUploadId),
          isNull(uploads.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async create(data: NewUpload): Promise<Upload> {
    const [row] = await this.db.insert(uploads).values(data).returning(uploadReturningColumns);
    return row;
  }

  async createWithFiles(
    data: NewUpload,
    files: Array<{
      imageId: string;
      latitude: number | null;
      longitude: number | null;
      objectKey: (uploadId: string, imageId: string) => string;
      contentType: string;
      sizeBytes: number | null;
    }>,
  ): Promise<{ upload: Upload; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const [parent] = await tx.execute(
        sql`SELECT property_id FROM talhoes WHERE id = ${data.talhaoId} AND deleted_at IS NULL FOR SHARE`,
      );
      if (!parent) throw new NotFoundException('Upload talhao is unavailable');
      let cropTypeId = data.cropTypeId;
      if (data.estadioId) {
        const [stage] = await tx.execute(
          sql`SELECT crop_type_id FROM estadios WHERE id = ${data.estadioId} AND deleted_at IS NULL FOR SHARE`,
        );
        if (!stage) throw new NotFoundException('Upload estadio is unavailable');
        cropTypeId = stage.crop_type_id as string;
      }
      const [upload] = await tx
        .insert(uploads)
        .values({
          ...data,
          cropTypeId,
          id: data.id ?? randomUUID(),
        })
        .onConflictDoNothing({ target: [uploads.userId, uploads.clientUploadId] })
        .returning();
      if (!upload) {
        const [existing] = await tx
          .select(uploadColumns)
          .from(uploads)
          .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
          .where(
            and(
              eq(uploads.userId, data.userId),
              eq(uploads.clientUploadId, data.clientUploadId),
              isNull(uploads.deletedAt),
            ),
          )
          .limit(1);
        if (!existing) throw namedError('CLIENT_UPLOAD_ID_DELETED');
        return { upload: existing, created: false };
      }
      if (files.length) {
        const images = files.map((file) => ({
          id: file.imageId,
          uploadId: upload.id,
          latitude: file.latitude,
          longitude: file.longitude,
        }));
        await tx.insert(uploadImages).values(images);
        await tx.insert(uploadFiles).values(
          files.map((file, index) => ({
            imageId: images[index].id,
            variant: 'original',
            objectKey: file.objectKey(upload.id, images[index].id),
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          })),
        );
      }
      return { upload: { ...upload, propertyId: parent.property_id as string }, created: true };
    });
  }

  async renewDraft(id: string): Promise<Upload | undefined> {
    const [row] = await this.db
      .update(uploads)
      .set({
        status: 'draft',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploads.id, id),
          inArray(uploads.status, ['draft', 'failed']),
          isNull(uploads.deletedAt),
        ),
      )
      .returning(uploadReturningColumns);
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(uploads)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(uploads.id, id));
  }

  /** Atomically clean one bounded status batch and enqueue every known key. */
  async cleanupAbandoned(
    status: 'draft' | 'failed',
    olderThan: Date,
    limit: number,
    runAfter = new Date(),
  ): Promise<AbandonedCleanupResult> {
    if (limit <= 0) return { deleted: 0, skipped: 0, enqueuedObjects: 0 };
    const olderThanIso = olderThan.toISOString();
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id, user_id
        FROM uploads
        WHERE status = ${status} AND deleted_at IS NULL
          AND updated_at <= ${olderThanIso}
        ORDER BY updated_at, id
        FOR UPDATE SKIP LOCKED LIMIT ${limit}
      `);
      let deleted = 0;
      let enqueuedObjects = 0;
      for (const raw of rows as unknown as Array<Record<string, unknown>>) {
        const uploadId = String(raw.id);
        const userId = String(raw.user_id);
        const files = await tx
          .select(fileColumns)
          .from(uploadFiles)
          .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
          .where(eq(uploadImages.uploadId, uploadId));
        const keys = deriveUploadObjectKeys(userId, uploadId, files);

        const updated =
          await tx.execute(sql`UPDATE uploads SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${uploadId} AND status = ${status} AND deleted_at IS NULL RETURNING id`);
        if (!updated.length) continue;
        deleted++;
        const values = [...keys].map((objectKey) => ({ objectKey, uploadId, runAfter }));
        if (values.length) {
          await tx.insert(objectDeletionJobs).values(values);
          enqueuedObjects += values.length;
        }
      }
      return { deleted, skipped: rows.length - deleted, enqueuedObjects };
    });
  }

  /** Atomically persist observed seals and transition an upload/enqueue finalization. */
  async sealAndTransitionToFinalizing(
    uploadId: string,
    seals: Array<{ id: string; observedEtag: string; sizeBytes: number }>,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const transitioned = await tx
        .update(uploads)
        .set({ status: 'finalizing', errorMessage: null, updatedAt: new Date() })
        .where(
          and(
            eq(uploads.id, uploadId),
            isNull(uploads.deletedAt),
            sql`${uploads.status} IN ('draft', 'failed')`,
          ),
        )
        .returning({ id: uploads.id });
      if (transitioned.length !== 1) return false;
      for (const seal of seals) {
        const updated = await tx
          .update(uploadFiles)
          .set({ observedEtag: seal.observedEtag, sizeBytes: seal.sizeBytes })
          .where(
            and(
              eq(uploadFiles.id, seal.id),
              inArray(
                uploadFiles.imageId,
                tx
                  .select({ id: uploadImages.id })
                  .from(uploadImages)
                  .where(eq(uploadImages.uploadId, uploadId)),
              ),
              eq(uploadFiles.variant, 'original'),
            ),
          )
          .returning({ id: uploadFiles.id });
        if (updated.length !== 1)
          throw new Error(`Upload file ${seal.id} changed during completion`);
      }
      await tx.insert(uploadFinalizationJobs).values({ uploadId });
      return true;
    });
  }

  /** Atomically claim deletion, snapshot its files, and enqueue object jobs. */
  async softDeleteAndEnqueueObjects(
    uploadId: string,
    runAfter: Date,
    audit?: { actorUserId: string },
  ): Promise<{ deleted: boolean; files: UploadFile[] }> {
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT user_id FROM uploads WHERE id = ${uploadId} FOR UPDATE`,
      );
      if (!locked.length) return { deleted: false, files: [] };
      const upload = locked[0] as { user_id: string };

      const deleted = await tx
        .update(uploads)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(uploads.id, uploadId), isNull(uploads.deletedAt)))
        .returning({ id: uploads.id });
      if (deleted.length !== 1) return { deleted: false, files: [] };

      const files = await tx
        .select(fileColumns)
        .from(uploadFiles)
        .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
        .where(eq(uploadImages.uploadId, uploadId));
      const keys = deriveUploadObjectKeys(upload.user_id, uploadId, files);
      const jobs = [...keys].map((objectKey) => ({ objectKey, uploadId, runAfter }));
      if (jobs.length > 0) await tx.insert(objectDeletionJobs).values(jobs);
      if (audit)
        await tx.insert(auditEvents).values({
          eventType: 'upload_deleted',
          actorUserId: audit.actorUserId,
          resourceType: 'upload',
          resourceId: uploadId,
          metadata: { fileCount: files.length, deletionType: 'soft_delete' },
        });
      return { deleted: true, files };
    });
  }

  async listByIds(ids: string[]): Promise<Upload[]> {
    if (ids.length === 0) return [];
    return this.db
      .select(uploadColumns)
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(and(inArray(uploads.id, ids), isNull(uploads.deletedAt)));
  }

  /**
   * List non-deleted uploads for a given user (any status).
   */
  async listByUserId(userId: string): Promise<Upload[]> {
    return this.db
      .select(uploadColumns)
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(and(eq(uploads.userId, userId), isNull(uploads.deletedAt)));
  }

  // ── Dynamic queries for listUploads ──────────────────────────────

  /**
   * Count uploads matching a dynamic WHERE clause (for paginated listing).
   */
  async countWhere(whereClause: SQL | undefined): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .where(whereClause);
    return count;
  }

  /**
   * Count uploads over the same joins as {@link listWhereEnriched}.
   *
   * Required when the WHERE clause references joined tables (e.g. the
   * free-text search over user/catalog names), otherwise the count query
   * would fail with a missing FROM-clause entry error.
   */
  async countWhereEnriched(whereClause: SQL | undefined): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .leftJoin(users, eq(uploads.userId, users.id))
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .leftJoin(properties, eq(talhoes.propertyId, properties.id))
      .leftJoin(cropTypes, eq(uploads.cropTypeId, cropTypes.id))
      .leftJoin(estadios, eq(uploads.estadioId, estadios.id))
      .where(whereClause);
    return count;
  }

  /**
   * Find a single upload by ID (any status) with joined user and catalog
   * display names.  Returns undefined when the upload does not exist.
   *
   * Includes all upload columns needed for the detail endpoint
   * (clientUploadId, errorMessage) in addition to enriched display names.
   */
  async findByIdEnriched(id: string): Promise<EnrichedUploadRow | undefined> {
    const [row] = await this.db
      .select({
        id: uploads.id,
        status: uploads.status,
        source: uploads.source,
        activityDate: uploads.activityDate,
        createdAt: uploads.createdAt,
        updatedAt: uploads.updatedAt,
        userId: uploads.userId,
        propertyId: talhoes.propertyId,
        talhaoId: uploads.talhaoId,
        cropTypeId: uploads.cropTypeId,
        estadioId: uploads.estadioId,
        clientUploadId: uploads.clientUploadId,
        errorMessage: uploads.errorMessage,
        userFullName: users.fullName,
        propertyName: properties.name,
        talhaoName: talhoes.name,
        cropTypeName: cropTypes.name,
        estadioName: estadios.name,
      })
      .from(uploads)
      .leftJoin(users, eq(uploads.userId, users.id))
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .leftJoin(properties, eq(talhoes.propertyId, properties.id))
      .leftJoin(cropTypes, eq(uploads.cropTypeId, cropTypes.id))
      .leftJoin(estadios, eq(uploads.estadioId, estadios.id))
      .where(eq(uploads.id, id))
      .limit(1);
    return row as EnrichedUploadRow | undefined;
  }

  /**
   * Enriched list query: joins users, properties, talhoes, cropTypes,
   * estadios so the list response includes display names without N+1 lookups.
   */
  async listWhereEnriched(
    whereClause: SQL | undefined,
    limit: number,
    offset: number,
  ): Promise<EnrichedUploadRow[]> {
    return this.db
      .select({
        id: uploads.id,
        status: uploads.status,
        source: uploads.source,
        activityDate: uploads.activityDate,
        createdAt: uploads.createdAt,
        updatedAt: uploads.updatedAt,
        userId: uploads.userId,
        propertyId: talhoes.propertyId,
        talhaoId: uploads.talhaoId,
        cropTypeId: uploads.cropTypeId,
        estadioId: uploads.estadioId,
        userFullName: users.fullName,
        propertyName: properties.name,
        talhaoName: talhoes.name,
        cropTypeName: cropTypes.name,
        estadioName: estadios.name,
      })
      .from(uploads)
      .leftJoin(users, eq(uploads.userId, users.id))
      .innerJoin(talhoes, eq(uploads.talhaoId, talhoes.id))
      .leftJoin(properties, eq(talhoes.propertyId, properties.id))
      .leftJoin(cropTypes, eq(uploads.cropTypeId, cropTypes.id))
      .leftJoin(estadios, eq(uploads.estadioId, estadios.id))
      .where(whereClause)
      .orderBy(desc(uploads.createdAt), desc(uploads.id))
      .limit(limit)
      .offset(offset);
  }

  /**
   * For each upload ID, return the first preview in image order.
   * Returns a Map keyed by uploadId.
   */
  async findFirstPreviewByUploadIds(uploadIds: string[]): Promise<Map<string, UploadFile>> {
    if (uploadIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([uploadImages.uploadId], fileColumns)
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(and(inArray(uploadImages.uploadId, uploadIds), eq(uploadFiles.variant, 'preview')))
      .orderBy(uploadImages.uploadId, uploadImages.id, uploadFiles.id);
    return new Map(rows.map((row) => [row.uploadId, row]));
  }

  /**
   * Count files grouped by upload ID for a set of upload IDs and variant.
   */
  async countFilesByUploadIds(
    uploadIds: string[],
    variant: 'original' | 'preview',
  ): Promise<Map<string, number>> {
    if (uploadIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        uploadId: uploadImages.uploadId,
        count: sql<number>`count(*)::int`,
      })
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(and(inArray(uploadImages.uploadId, uploadIds), eq(uploadFiles.variant, variant)))
      .groupBy(uploadImages.uploadId);
    return new Map(rows.map((r) => [r.uploadId, r.count]));
  }

  async countOriginalsByUploadIds(uploadIds: string[]): Promise<Map<string, number>> {
    return this.countFilesByUploadIds(uploadIds, 'original');
  }

  async countPreviewsByUploadIds(uploadIds: string[]): Promise<Map<string, number>> {
    return this.countFilesByUploadIds(uploadIds, 'preview');
  }

  // ── Upload file queries ──────────────────────────────────────────

  async upsertFile(data: NewUploadFile): Promise<UploadFile> {
    const [row] = await this.db
      .insert(uploadFiles)
      .values(data)
      .onConflictDoUpdate({
        target: [uploadFiles.imageId, uploadFiles.variant],
        set: {
          objectKey: data.objectKey,
          contentType: data.contentType,
          sizeBytes: data.sizeBytes,
          width: data.width,
          height: data.height,
        },
      })
      .returning();
    return (await this.findFileById(row.id))!;
  }

  async findFilesByUploadId(uploadId: string): Promise<UploadFile[]> {
    return this.db
      .select(fileColumns)
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(eq(uploadImages.uploadId, uploadId))
      .orderBy(asc(uploadImages.id), asc(uploadFiles.variant));
  }

  async findOriginalsByUploadIds(uploadIds: string[]): Promise<UploadFile[]> {
    if (uploadIds.length === 0) return [];
    return this.db
      .select(fileColumns)
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(and(inArray(uploadImages.uploadId, uploadIds), eq(uploadFiles.variant, 'original')))
      .orderBy(uploadImages.uploadId, uploadImages.id);
  }

  async findFileById(id: string): Promise<UploadFile | undefined> {
    const [row] = await this.db
      .select(fileColumns)
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(eq(uploadFiles.id, id))
      .limit(1);
    return row;
  }
}
