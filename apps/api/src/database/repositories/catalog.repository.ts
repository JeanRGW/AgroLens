import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { count, eq, and, isNull, inArray, SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import {
  properties,
  talhoes,
  cropTypes,
  estadios,
  uploadFiles,
  uploadImages,
  objectDeletionJobs,
} from '../schema';
import { deriveUploadObjectKeys } from '../database.utils';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type Property = InferSelectModel<typeof properties>;
export type NewProperty = InferInsertModel<typeof properties>;
export type Talhao = InferSelectModel<typeof talhoes>;
export type NewTalhao = InferInsertModel<typeof talhoes>;
export type CropType = InferSelectModel<typeof cropTypes>;
export type NewCropType = InferInsertModel<typeof cropTypes>;
export type Estadio = InferSelectModel<typeof estadios>;
export type NewEstadio = InferInsertModel<typeof estadios>;

@Injectable()
export class CatalogRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  private async cascadeSoftDeleteUploads(tx: DatabaseConnection, condition: SQL): Promise<void> {
    const rows = await tx.execute(sql`
      SELECT id, user_id
      FROM uploads
      WHERE deleted_at IS NULL AND ${condition}
      ORDER BY id
      FOR UPDATE
    `);
    if (!rows.length) return;

    const uploadsToDelete = rows as unknown as Array<{ id: string; user_id: string }>;
    const uploadIds = uploadsToDelete.map((upload) => upload.id);
    const uploadIdList = sql.join(
      uploadIds.map((uploadId) => sql`${uploadId}`),
      sql`, `,
    );

    await tx.execute(sql`
      UPDATE upload_finalization_jobs
      SET status = 'dead', completed_at = NOW(), retry_after = NULL,
          locked_at = NULL, locked_by = NULL, lock_token = NULL,
          last_error = 'upload deleted by catalog cascade'
      WHERE upload_id IN (${uploadIdList}) AND status IN ('pending', 'running')
    `);

    const files = await tx
      .select()
      .from(uploadFiles)
      .innerJoin(uploadImages, eq(uploadFiles.imageId, uploadImages.id))
      .where(inArray(uploadImages.uploadId, uploadIds));
    const filesByUpload = new Map<string, typeof files>();
    for (const file of files) {
      const group = filesByUpload.get(file.upload_images.uploadId) ?? [];
      group.push(file);
      filesByUpload.set(file.upload_images.uploadId, group);
    }
    const runAfter = new Date(Date.now() + 7 * 86400000);
    for (const upload of uploadsToDelete) {
      const keys = deriveUploadObjectKeys(
        upload.user_id,
        upload.id,
        (filesByUpload.get(upload.id) ?? []).map((row) => row.upload_files),
      );
      if (keys.size) {
        await tx
          .insert(objectDeletionJobs)
          .values([...keys].map((objectKey) => ({ objectKey, uploadId: upload.id, runAfter })));
      }
    }
    await tx.execute(sql`
      UPDATE uploads SET deleted_at = NOW(), updated_at = NOW()
      WHERE id IN (${uploadIdList}) AND deleted_at IS NULL
    `);
  }

  // ── Properties ───────────────────────────────────────────────────

  async findPropertyById(id: string): Promise<Property | undefined> {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(and(eq(properties.id, id), isNull(properties.deletedAt)))
      .limit(1);
    return row;
  }

  async listProperties(): Promise<Property[]> {
    return this.db.select().from(properties).where(isNull(properties.deletedAt));
  }

  async countProperties(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(properties)
      .where(isNull(properties.deletedAt));
    return row?.count ?? 0;
  }

  async createProperty(data: NewProperty): Promise<Property> {
    const [row] = await this.db.insert(properties).values(data).returning();
    return row;
  }

  async updateProperty(
    id: string,
    data: Partial<
      Pick<
        Property,
        'name' | 'normalizedName' | 'owner' | 'address' | 'latitude' | 'longitude' | 'userId'
      >
    >,
  ): Promise<Property | undefined> {
    const [row] = await this.db
      .update(properties)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(properties.id, id), isNull(properties.deletedAt)))
      .returning();
    return row;
  }

  async softDeleteProperty(id: string): Promise<Property | undefined> {
    // Transactionally cascade the approved soft delete: the property, every of
    // its talhões, and every upload linked to them (plus their object-deletion
    // jobs so physical objects are removed after the retention delay).
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(properties)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(properties.id, id), isNull(properties.deletedAt)))
        .returning();
      if (!deleted) return undefined;

      await tx.execute(
        sql`UPDATE talhoes SET deleted_at = NOW(), updated_at = NOW()
          WHERE property_id = ${id} AND deleted_at IS NULL`,
      );
      await this.cascadeSoftDeleteUploads(
        tx,
        sql`talhao_id IN (SELECT id FROM talhoes WHERE property_id = ${id})`,
      );

      return deleted;
    });
  }

  // ── Talhões ──────────────────────────────────────────────────────

  async findTalhaoById(id: string): Promise<Talhao | undefined> {
    const [row] = await this.db
      .select()
      .from(talhoes)
      .where(and(eq(talhoes.id, id), isNull(talhoes.deletedAt)))
      .limit(1);
    return row;
  }

  async listTalhoes(propertyId?: string): Promise<Talhao[]> {
    const conditions: SQL[] = [isNull(talhoes.deletedAt)];
    if (propertyId) {
      conditions.push(eq(talhoes.propertyId, propertyId));
    }
    return this.db
      .select()
      .from(talhoes)
      .where(and(...conditions));
  }

  async countTalhoes(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(talhoes)
      .where(isNull(talhoes.deletedAt));
    return row?.count ?? 0;
  }

  async createTalhao(data: NewTalhao): Promise<Talhao> {
    const [row] = await this.db.insert(talhoes).values(data).returning();
    return row;
  }

  async updateTalhao(
    id: string,
    data: Partial<Pick<Talhao, 'name' | 'normalizedName' | 'userId' | 'propertyId'>>,
  ): Promise<Talhao | undefined> {
    return this.db.transaction(async (tx) => {
      if (data.propertyId) {
        const [parent] = await tx.execute(
          sql`SELECT id FROM properties WHERE id = ${data.propertyId} AND deleted_at IS NULL FOR SHARE`,
        );
        if (!parent) throw new NotFoundException('Parent property not found');
      }
      const [row] = await tx
        .update(talhoes)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(talhoes.id, id), isNull(talhoes.deletedAt)))
        .returning();
      return row;
    });
  }

  async softDeleteTalhao(id: string): Promise<Talhao | undefined> {
    // Cascade the soft delete to the talhão's uploads and enqueue their
    // physical object deletion, mirroring the property-delete behaviour.
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(talhoes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(talhoes.id, id), isNull(talhoes.deletedAt)))
        .returning();
      if (!deleted) return undefined;

      await this.cascadeSoftDeleteUploads(tx, sql`talhao_id = ${id}`);

      return deleted;
    });
  }

  // ── Crop Types ───────────────────────────────────────────────────

  async findCropTypeById(id: string): Promise<CropType | undefined> {
    const [row] = await this.db
      .select()
      .from(cropTypes)
      .where(and(eq(cropTypes.id, id), isNull(cropTypes.deletedAt)))
      .limit(1);
    return row;
  }

  async listCropTypes(): Promise<CropType[]> {
    return this.db.select().from(cropTypes).where(isNull(cropTypes.deletedAt));
  }

  async countCropTypes(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(cropTypes)
      .where(isNull(cropTypes.deletedAt));
    return row?.count ?? 0;
  }

  async createCropType(data: NewCropType): Promise<CropType> {
    const [row] = await this.db.insert(cropTypes).values(data).returning();
    return row;
  }

  async updateCropType(
    id: string,
    data: Partial<Pick<CropType, 'name' | 'normalizedName' | 'userId'>>,
  ): Promise<CropType | undefined> {
    const [row] = await this.db
      .update(cropTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cropTypes.id, id), isNull(cropTypes.deletedAt)))
      .returning();
    return row;
  }

  async softDeleteCropType(id: string): Promise<CropType | undefined> {
    // Transactionally cascade the approved soft delete to the crop type's
    // estádios so the UI claim ("removes associated estádios") holds.
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(cropTypes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(cropTypes.id, id), isNull(cropTypes.deletedAt)))
        .returning();
      if (!deleted) return undefined;

      await tx.execute(
        sql`UPDATE estadios SET deleted_at = NOW(), updated_at = NOW()
          WHERE crop_type_id = ${id} AND deleted_at IS NULL`,
      );
      await this.cascadeSoftDeleteUploads(tx, sql`crop_type_id = ${id}`);

      return deleted;
    });
  }

  // ── Estadios ─────────────────────────────────────────────────────

  async findEstadioById(id: string): Promise<Estadio | undefined> {
    const [row] = await this.db
      .select()
      .from(estadios)
      .where(and(eq(estadios.id, id), isNull(estadios.deletedAt)))
      .limit(1);
    return row;
  }

  async listEstadios(cropTypeId?: string): Promise<Estadio[]> {
    const conditions: SQL[] = [isNull(estadios.deletedAt)];
    if (cropTypeId) {
      conditions.push(eq(estadios.cropTypeId, cropTypeId));
    }
    return this.db
      .select()
      .from(estadios)
      .where(and(...conditions));
  }

  async countEstadios(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(estadios)
      .where(isNull(estadios.deletedAt));
    return row?.count ?? 0;
  }

  async createEstadio(data: NewEstadio): Promise<Estadio> {
    const [row] = await this.db.insert(estadios).values(data).returning();
    return row;
  }

  async updateEstadio(
    id: string,
    data: Partial<Pick<Estadio, 'name' | 'normalizedName' | 'userId' | 'cropTypeId'>>,
  ): Promise<Estadio | undefined> {
    return this.db.transaction(async (tx) => {
      if (data.cropTypeId) {
        const [parent] = await tx.execute(
          sql`SELECT id FROM crop_types WHERE id = ${data.cropTypeId} AND deleted_at IS NULL FOR SHARE`,
        );
        if (!parent) throw new NotFoundException('Parent crop type not found');
      }
      const [row] = await tx
        .update(estadios)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(estadios.id, id), isNull(estadios.deletedAt)))
        .returning();
      return row;
    });
  }

  async softDeleteEstadio(id: string): Promise<Estadio | undefined> {
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(estadios)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(estadios.id, id), isNull(estadios.deletedAt)))
        .returning();
      if (!deleted) return undefined;

      await this.cascadeSoftDeleteUploads(tx, sql`estadio_id = ${id}`);
      return deleted;
    });
  }
}
