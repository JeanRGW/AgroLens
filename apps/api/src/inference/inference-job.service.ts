import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  InferenceRepository,
  InferenceModelsRepository,
  type InferenceModel,
} from '../database/repositories';
import type {
  CreateJobResponse,
  Detection,
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobListResponse,
  InferenceModelSnapshot,
} from '@agrolens/contracts';
import { StorageService } from '../storage/storage.service';
import { resolveRetentionDays } from '../config/env.schema';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { assertOwnerOrAdmin, assertCanAccessUpload } from '../auth/auth.service';
import type { CreateJobDto } from './dto/create-job.dto';
import type { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { UploadsRepository, AccessRepository } from '../database/repositories';
import {
  ALLOWED_CONTENT_TYPES,
  CONTENT_TYPE_TO_EXTENSION,
  type AllowedContentType,
} from '../image-processing/image-processing.service';

@Injectable()
export class InferenceJobService {
  private readonly tempMaxFiles: number;
  private readonly tempMaxFileSizeBytes: number;
  private readonly jobRetentionDays: number;
  private readonly imageTtlSeconds: number;
  private readonly presignedUrlTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly inferenceRepository: InferenceRepository,
    private readonly modelsRepository: InferenceModelsRepository,
    private readonly uploadsRepository: UploadsRepository,
    private readonly accessRepository: AccessRepository,
    private readonly storageService: StorageService,
  ) {
    this.tempMaxFiles = this.configService.get<number>('INFERENCE_TEMP_MAX_FILES', 20);
    this.tempMaxFileSizeBytes = this.configService.get<number>(
      'INFERENCE_TEMP_MAX_FILE_SIZE_BYTES',
      25 * 1024 * 1024,
    );
    this.jobRetentionDays = resolveRetentionDays(
      this.configService.get<number | undefined>('RETENTION_DAYS'),
      this.configService.get<number | undefined>('INFERENCE_JOB_RETENTION_DAYS'),
    );
    this.imageTtlSeconds = this.configService.get<number>('INFERENCE_IMAGE_TTL_SECONDS', 900);
    this.presignedUrlTtlSeconds = this.configService.get<number>(
      'UPLOAD_PRESIGNED_URL_TTL_SECONDS',
      900,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Job creation
  // ═══════════════════════════════════════════════════════════════════

  async createJob(dto: CreateJobDto, currentUser: AuthenticatedUser): Promise<CreateJobResponse> {
    const model = await this.modelsRepository.findModelById(dto.modelId);
    if (!model) throw new NotFoundException('Model not found');
    if (model.status !== 'ready' || !model.active) {
      throw new BadRequestException('Model is not available for inference');
    }

    const modelSnapshot: InferenceModelSnapshot = {
      id: model.id,
      name: model.name,
      task: model.task,
      classes: model.classes,
    };

    if (dto.uploadId) {
      return this.createUploadJob(dto.uploadId, dto.imageIds, model, modelSnapshot, currentUser);
    }

    if (dto.files) {
      return this.createTemporaryJob(dto.files, model, modelSnapshot, currentUser);
    }

    throw new BadRequestException('Either uploadId or files must be provided');
  }

  private async createUploadJob(
    uploadId: string,
    imageIds: string[] | undefined,
    model: InferenceModel,
    modelSnapshot: InferenceModelSnapshot,
    currentUser: AuthenticatedUser,
  ): Promise<CreateJobResponse> {
    await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );

    const uploadFiles = await this.uploadsRepository.findFilesByUploadId(uploadId);
    const originals = uploadFiles.filter((f) => f.variant === 'original');
    if (originals.length === 0)
      throw new BadRequestException('No original images found in the upload');

    let filtered = originals;
    if (imageIds && imageIds.length > 0) {
      filtered = originals.filter((file) => imageIds.includes(file.imageId));
      if (filtered.length !== new Set(imageIds).size) {
        throw new BadRequestException('One or more requested images are not in this upload');
      }
    }

    if (filtered.length === 0) {
      throw new BadRequestException('No original images found in the upload');
    }

    const jobId = randomUUID();
    const expiresAt = new Date(Date.now() + this.jobRetentionDays * 24 * 60 * 60 * 1000);

    const observations: Array<{ id: string; observedEtag: string; sizeBytes: number }> = [];
    for (const file of filtered) {
      if (file.observedEtag && file.sizeBytes && file.sizeBytes > 0) {
        observations.push({
          id: file.id,
          observedEtag: file.observedEtag,
          sizeBytes: file.sizeBytes,
        });
        continue;
      }
      const head = await this.storageService.headObject(file.objectKey);
      if (
        !head.exists ||
        !head.contentLength ||
        head.contentLength <= 0 ||
        !head.etag ||
        head.contentLength > this.tempMaxFileSizeBytes
      ) {
        throw new BadRequestException(
          `Original upload image has no valid storage seal: ${file.objectKey}`,
        );
      }
      observations.push({
        id: file.id,
        observedEtag: head.etag.replace(/^"|"$/g, ''),
        sizeBytes: head.contentLength,
      });
    }
    const observedById = new Map(observations.map((observation) => [observation.id, observation]));
    const imageData = filtered.map((file, index) => ({
      imageIndex: index,
      uploadImageId: file.imageId,
      fileName: file.objectKey.split('/').pop() ?? `image_${file.imageId}`,
      sourceObjectKey: file.objectKey,
      status: 'queued' as const,
      observedEtag: observedById.get(file.id)?.observedEtag,
    }));
    let job;
    try {
      job = await this.inferenceRepository.createUploadJobWithFence(
        {
          id: jobId,
          userId: currentUser.sub,
          modelId: model.id,
          modelSnapshot,
          sourceType: 'upload',
          uploadId,
          status: 'queued',
          imageCount: imageData.length,
          expiresAt,
        },
        imageData,
        observations,
        {
          actorUserId: currentUser.sub,
          metadata: { sourceType: 'upload', uploadId, imageCount: imageData.length },
        },
      );
    } catch (error) {
      throw this.translateFenceError(error);
    }

    return { id: job.id, status: job.status, imageCount: job.imageCount };
  }

  private async createTemporaryJob(
    files: { fileName: string; contentType: string; sizeBytes: number }[],
    model: InferenceModel,
    modelSnapshot: InferenceModelSnapshot,
    currentUser: AuthenticatedUser,
  ): Promise<CreateJobResponse> {
    if (files.length > this.tempMaxFiles) {
      throw new BadRequestException(
        `Too many files. Maximum is ${this.tempMaxFiles}, got ${files.length}`,
      );
    }

    for (const file of files) {
      if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.contentType)) {
        throw new BadRequestException(
          `Unsupported content type "${file.contentType}". Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        );
      }
      if (file.sizeBytes > this.tempMaxFileSizeBytes) {
        throw new BadRequestException(
          `File size ${file.sizeBytes} exceeds maximum of ${this.tempMaxFileSizeBytes} bytes`,
        );
      }
    }

    const jobId = randomUUID();
    const expiresAt = new Date(Date.now() + this.jobRetentionDays * 24 * 60 * 60 * 1000);

    const presignedUrls: CreateJobResponse['files'] = [];
    const imageData: Array<{
      imageIndex: number;
      fileName: string;
      sourceObjectKey: string;
      status: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = CONTENT_TYPE_TO_EXTENSION[file.contentType as AllowedContentType] ?? 'bin';
      const objectKey = `inference/${currentUser.sub}/${jobId}/${i}/original.${ext}`;

      const presigned = await this.storageService.getPresignedPutUrl(
        objectKey,
        file.contentType,
        this.presignedUrlTtlSeconds,
      );

      presignedUrls.push({
        imageIndex: i,
        uploadUrl: presigned.url,
        objectKey: presigned.objectKey,
        headers: presigned.headers,
        expiresAt: presigned.expiresAt,
      });

      imageData.push({
        imageIndex: i,
        fileName: file.fileName,
        sourceObjectKey: objectKey,
        status: 'queued',
      });
    }

    await this.inferenceRepository.createJobWithImages(
      {
        id: jobId,
        userId: currentUser.sub,
        modelId: model.id,
        modelSnapshot,
        sourceType: 'temporary',
        status: 'uploading',
        imageCount: imageData.length,
        expiresAt,
      },
      imageData,
      {
        actorUserId: currentUser.sub,
        metadata: { sourceType: 'temporary', imageCount: imageData.length },
      },
    );

    return { id: jobId, status: 'uploading', imageCount: imageData.length, files: presignedUrls };
  }

  /**
   * Translate named transaction errors raised by the repositories into the
   * appropriate 4xx response. Unknown errors propagate unchanged.
   */
  private translateFenceError(error: unknown): never {
    if (error instanceof Error && error.name === 'UPLOAD_NOT_READY') {
      throw new ConflictException({
        code: error.name,
        message: 'Upload is not ready for inference',
      });
    }
    if (error instanceof Error && error.name === 'UPLOAD_FILE_CHANGED') {
      throw new ConflictException({
        code: error.name,
        message: 'Upload files changed while creating the job; retry',
      });
    }
    if (error instanceof Error && error.name === 'UPLOAD_SEAL_MISMATCH') {
      throw new ConflictException({
        code: error.name,
        message: 'Upload files changed since they were observed',
      });
    }
    throw error;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Temporary job completion
  // ═══════════════════════════════════════════════════════════════════

  async completeTemporaryJob(
    jobId: string,
    currentUser: AuthenticatedUser,
  ): Promise<{ jobId: string; status: string }> {
    const job = await this.inferenceRepository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job not found');

    if (job.sourceType !== 'temporary') {
      throw new BadRequestException('Only temporary jobs can be completed');
    }

    assertOwnerOrAdmin(job.userId, currentUser);

    if (job.status !== 'uploading') {
      throw new ConflictException(`Job is in "${job.status}" status, cannot complete`);
    }

    const images = await this.inferenceRepository.listImagesByJobId(jobId);
    // Collect observations outside the transaction, then seal and queue atomically.
    const observations: Array<{ id: string; observedEtag: string; sizeBytes: number }> = [];
    for (const image of images) {
      const head = await this.storageService.headObject(image.sourceObjectKey);
      if (!head.exists || head.contentLength === undefined || head.contentLength <= 0) {
        throw new BadRequestException(
          `Image file is missing or has invalid size: ${image.fileName}`,
        );
      }
      if (head.contentLength > this.tempMaxFileSizeBytes) {
        throw new BadRequestException(`Image file exceeds maximum size: ${image.fileName}`);
      }
      if (!head.etag)
        throw new BadRequestException(`Image file has no storage seal: ${image.fileName}`);
      observations.push({
        id: image.id,
        observedEtag: head.etag.replace(/^"|"$/g, ''),
        sizeBytes: head.contentLength,
      });
    }

    const updated = await this.inferenceRepository.sealAndCompleteTemporaryJob(jobId, observations);
    if (!updated) throw new NotFoundException('Job not found after completion');

    return { jobId: updated.id, status: updated.status };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Job listing & detail
  // ═══════════════════════════════════════════════════════════════════

  async listJobs(
    dto: ListJobsQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<InferenceJobListResponse> {
    const { jobs, total } = await this.inferenceRepository.listJobsByUserId(
      currentUser.sub,
      dto.limit,
      dto.offset,
    );

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        sourceType: j.sourceType,
        imageCount: j.imageCount,
        completedCount: j.completedCount,
        failedCount: j.failedCount,
        modelSnapshot: (j.modelSnapshot as InferenceModelSnapshot) ?? null,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        completedAt: j.completedAt,
        expiresAt: j.expiresAt,
      })),
      total,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  async getJobDetail(jobId: string, currentUser: AuthenticatedUser): Promise<InferenceJobDetail> {
    const job = await this.inferenceRepository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job not found');

    const isOwner = job.userId === currentUser.sub;
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this job');
    }

    // Re-check upload access for upload-sourced jobs
    if (job.sourceType === 'upload' && job.uploadId) {
      await assertCanAccessUpload(
        this.uploadsRepository,
        this.accessRepository,
        job.uploadId,
        currentUser,
      );
    }

    const images = await this.inferenceRepository.listImagesByJobId(jobId);

    return {
      id: job.id,
      modelId: job.modelId,
      modelSnapshot: job.modelSnapshot as InferenceModelSnapshot,
      sourceType: job.sourceType,
      uploadId: job.uploadId ?? null,
      status: job.status,
      imageCount: job.imageCount,
      completedCount: job.completedCount,
      failedCount: job.failedCount,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      images: images.map((img) => ({
        id: img.id,
        imageIndex: img.imageIndex,
        uploadImageId: img.uploadImageId,
        fileName: img.fileName,
        status: img.status,
        detectionCount: Array.isArray(img.detections) ? img.detections.length : 0,
        inferenceMs: img.inferenceMs,
      })),
    };
  }

  async getImageResult(
    jobId: string,
    imageId: string,
    currentUser: AuthenticatedUser,
  ): Promise<InferenceJobImageResult> {
    const job = await this.inferenceRepository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job not found');

    const isOwner = job.userId === currentUser.sub;
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this job');
    }

    // Re-check upload access for upload-sourced jobs
    if (job.sourceType === 'upload' && job.uploadId) {
      await assertCanAccessUpload(
        this.uploadsRepository,
        this.accessRepository,
        job.uploadId,
        currentUser,
      );
    }

    const image = await this.inferenceRepository.findImageById(jobId, imageId);
    if (!image) throw new NotFoundException('Image not found in this job');

    const { url } = await this.storageService.getPresignedGetUrl(
      image.sourceObjectKey,
      this.imageTtlSeconds,
    );

    return {
      id: image.id,
      imageIndex: image.imageIndex,
      uploadImageId: image.uploadImageId,
      fileName: image.fileName,
      status: image.status,
      detections: image.detections as Detection[] | null,
      inferenceMs: image.inferenceMs,
      width: image.width,
      height: image.height,
      imageUrl: url,
      errorMessage: image.errorMessage,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Job deletion
  // ═══════════════════════════════════════════════════════════════════

  async deleteJob(jobId: string, currentUser: AuthenticatedUser): Promise<{ deleted: boolean }> {
    const job = await this.inferenceRepository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job not found');

    const isOwner = job.userId === currentUser.sub;
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this job');
    }

    // Only uploading, completed, failed can be deleted
    if (job.status === 'queued' || job.status === 'running') {
      throw new ConflictException(
        `Cannot delete job in "${job.status}" status. Wait for it to finish or cancel it first.`,
      );
    }

    const deletedJob = await this.inferenceRepository.deleteJob(jobId, {
      actorUserId: currentUser.sub,
    });
    if (!deletedJob) throw new ConflictException('Cannot delete job in its current status');

    return { deleted: true };
  }
}
