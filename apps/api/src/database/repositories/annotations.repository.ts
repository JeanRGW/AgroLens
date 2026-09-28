import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database.constants';
import { imageAnnotations, uploadImages } from '../schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type ImageAnnotation = InferSelectModel<typeof imageAnnotations>;
export type NewImageAnnotation = InferInsertModel<typeof imageAnnotations>;

@Injectable()
export class AnnotationsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection) {}

  /**
   * List all annotations for a given upload, ordered by image ID.
   */
  async findByUploadId(uploadId: string): Promise<ImageAnnotation[]> {
    return this.db
      .select()
      .from(imageAnnotations)
      .innerJoin(uploadImages, eq(imageAnnotations.imageId, uploadImages.id))
      .where(eq(uploadImages.uploadId, uploadId))
      .orderBy(uploadImages.id)
      .then((rows) => rows.map((row) => row.image_annotations));
  }

  /**
   * Get a single annotation by image ID.
   */
  async findOne(imageId: string): Promise<ImageAnnotation | undefined> {
    const [row] = await this.db
      .select()
      .from(imageAnnotations)
      .where(eq(imageAnnotations.imageId, imageId))
      .limit(1);
    return row;
  }

  /**
   * Upsert (replace) an annotation for a given image.
   */
  async upsert(data: NewImageAnnotation): Promise<ImageAnnotation> {
    const [row] = await this.db
      .insert(imageAnnotations)
      .values(data)
      .onConflictDoUpdate({
        target: imageAnnotations.imageId,
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
