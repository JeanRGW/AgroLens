import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  AnnotationsRepository,
  UploadsRepository,
  AccessRepository,
  type ImageAnnotation,
} from '../database/repositories';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { assertCanAccessUpload } from '../auth/auth.service';
import type { UpsertAnnotationDto } from './dto/upsert-annotation.dto';

@Injectable()
export class AnnotationsService {
  constructor(
    private readonly annotationsRepository: AnnotationsRepository,
    private readonly uploadsRepository: UploadsRepository,
    private readonly accessRepository: AccessRepository,
  ) {}

  /**
   * List all annotations for an upload the current user can access.
   */
  async listAnnotations(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<ImageAnnotation[]> {
    await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );
    return this.annotationsRepository.findByUploadId(uploadId);
  }

  /**
   * Get a single annotation for an upload image.
   */
  async getAnnotation(
    uploadId: string,
    imageId: string,
    currentUser: AuthenticatedUser,
  ): Promise<ImageAnnotation> {
    await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );
    await this.assertImageInUpload(uploadId, imageId);
    const annotation = await this.annotationsRepository.findOne(imageId);
    if (!annotation) {
      throw new NotFoundException('Annotation not found for this image');
    }
    return annotation;
  }

  /**
   * Upsert (last-write-wins) annotation for an upload image.
   */
  async upsertAnnotation(
    uploadId: string,
    imageId: string,
    dto: UpsertAnnotationDto,
    currentUser: AuthenticatedUser,
  ): Promise<ImageAnnotation> {
    const upload = await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );

    // Only owner or admin may write annotations
    const isOwner = upload.userId === currentUser.sub;
    const isAdmin = currentUser.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only the upload owner or an admin can modify annotations');
    }

    await this.assertImageInUpload(uploadId, imageId);
    return this.annotationsRepository.upsert({
      imageId,
      imageWidth: dto.imageWidth,
      imageHeight: dto.imageHeight,
      classes: dto.classes,
      labels: dto.labels,
      updatedByUserId: currentUser.sub,
    });
  }

  private async assertImageInUpload(uploadId: string, imageId: string): Promise<void> {
    const files = await this.uploadsRepository.findFilesByUploadId(uploadId);
    if (!files.some((file) => file.imageId === imageId && file.variant === 'original')) {
      throw new NotFoundException('Image not found in this upload');
    }
  }
}
