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
   * Get a single annotation for an upload + imageIndex.
   */
  async getAnnotation(
    uploadId: string,
    imageIndex: number,
    currentUser: AuthenticatedUser,
  ): Promise<ImageAnnotation> {
    await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );
    const annotation = await this.annotationsRepository.findOne(uploadId, imageIndex);
    if (!annotation) {
      throw new NotFoundException('Annotation not found for this image index');
    }
    return annotation;
  }

  /**
   * Upsert (last-write-wins) annotation for an upload + imageIndex.
   */
  async upsertAnnotation(
    uploadId: string,
    imageIndex: number,
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

    return this.annotationsRepository.upsert({
      uploadId,
      imageIndex,
      imageWidth: dto.imageWidth,
      imageHeight: dto.imageHeight,
      classes: dto.classes,
      labels: dto.labels,
      updatedByUserId: currentUser.sub,
    });
  }
}
