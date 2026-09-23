import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { imageAnnotations } from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type ImageAnnotation = InferSelectModel<typeof imageAnnotations>;
export type NewImageAnnotation = InferInsertModel<typeof imageAnnotations>;

@Injectable()
export class AnnotationsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  /**
   * List all annotations for a given upload, ordered by image_index.
   */
  async findByUploadId(uploadId: string): Promise<ImageAnnotation[]> {
    return this.db
      .select()
      .from(imageAnnotations)
      .where(eq(imageAnnotations.uploadId, uploadId))
      .orderBy(imageAnnotations.imageIndex);
  }

  /**
   * Get a single annotation by upload ID and image index.
   */
  async findOne(uploadId: string, imageIndex: number): Promise<ImageAnnotation | undefined> {
    const [row] = await this.db
      .select()
      .from(imageAnnotations)
      .where(
        and(eq(imageAnnotations.uploadId, uploadId), eq(imageAnnotations.imageIndex, imageIndex)),
      )
      .limit(1);
    return row;
  }

  /**
   * Upsert (replace) an annotation for a given upload + image_index.
   * Uses the unique constraint on (upload_id, image_index) for last-write-wins.
   */
  async upsert(data: NewImageAnnotation): Promise<ImageAnnotation> {
    const [row] = await this.db
      .insert(imageAnnotations)
      .values(data)
      .onConflictDoUpdate({
        target: [imageAnnotations.uploadId, imageAnnotations.imageIndex],
        set: {
          imageWidth: data.imageWidth,
          imageHeight: data.imageHeight,
          classes: data.classes,
          labels: data.labels,
          updatedByUserId: data.updatedByUserId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
