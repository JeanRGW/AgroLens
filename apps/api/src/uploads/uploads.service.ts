import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UploadsRepository,
  CatalogRepository,
  AccessRepository,
  AuditRepository,
  type Upload,
} from '../database/repositories';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { assertOwnerOrAdmin } from '../auth/auth.service';
import type { UploadInitDto } from './dto/upload-init.dto';
import type { UploadListDto } from './dto/upload-list.dto';
import type { ExportDownloadUrlsDto, DownloadUrlItem } from './dto/export-download.dto';
import type { DisplayUrlsResponse } from './dto/display-urls.dto';
import type {
  FileUploadInstruction,
  UploadInitResponse,
  UploadListResponse,
  UploadDetailResponse,
  UploadDashboardSnapshot,
  UploadMutationResponse,
} from './upload-types';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_CONTENT_TYPES,
  CONTENT_TYPE_TO_EXTENSION,
  type AllowedContentType,
} from '../image-processing/image-processing.service';
import { UploadQueryService, buildUploadSearchCondition } from './upload-query.service';

export { buildUploadSearchCondition };

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  private readonly maxFiles: number;
  private readonly maxFileSizeBytes: number;
  private readonly presignedUrlTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly accessRepository: AccessRepository,
    private readonly auditRepository: AuditRepository,
    private readonly storageService: StorageService,
    private readonly queryService: UploadQueryService,
  ) {
    this.maxFiles = this.configService.get<number>('UPLOAD_MAX_FILES', 100);
    this.maxFileSizeBytes = this.configService.get<number>(
      'UPLOAD_MAX_FILE_SIZE_BYTES',
      100 * 1024 * 1024,
    );
    this.presignedUrlTtlSeconds = this.configService.get<number>(
      'UPLOAD_PRESIGNED_URL_TTL_SECONDS',
      900,
    );
  }

  // ── Upload init (idempotent by user_id + client_upload_id) ─────────

  async initUpload(
    dto: UploadInitDto,
    currentUser: AuthenticatedUser,
  ): Promise<UploadInitResponse> {
    const userId = currentUser.sub;

    // Validate file count
    if (dto.files.length > this.maxFiles) {
      throw new BadRequestException(
        `Too many files. Maximum is ${this.maxFiles}, got ${dto.files.length}`,
      );
    }

    // Validate file descriptors
    for (const file of dto.files) {
      if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.contentType)) {
        throw new BadRequestException(
          `Unsupported content type "${file.contentType}". Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        );
      }
      if (file.sizeBytes !== undefined && file.sizeBytes > this.maxFileSizeBytes) {
        throw new BadRequestException(
          `File size ${file.sizeBytes} exceeds maximum of ${this.maxFileSizeBytes} bytes`,
        );
      }
    }

    // Assign image indices if not provided
    const fileDescriptors = dto.files.map((f, i) => ({
      ...f,
      imageIndex: f.imageIndex ?? i,
    }));

    // Check for duplicate image indices
    const indices = new Set(fileDescriptors.map((f) => f.imageIndex));
    if (indices.size !== fileDescriptors.length) {
      throw new BadRequestException('Duplicate image indices in files array');
    }

    // Check idempotency: existing upload with same (userId, clientUploadId)?
    const existing = await this.uploadsRepository.findByClientUploadId(userId, dto.clientUploadId);

    if (existing) {
      return this.handleExistingUpload(existing, dto, fileDescriptors);
    }

    await this.validateCatalogReferences(dto);

    let created;
    try {
      created = await this.uploadsRepository.createWithFiles(
        {
          clientUploadId: dto.clientUploadId,
          userId,
          talhaoId: dto.talhaoId,
          cropTypeId: dto.cropTypeId,
          estadioId: dto.estadioId ?? null,
          source: dto.source,
          status: 'draft',
          activityDate: dto.activityDate,
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
        fileDescriptors.map((file) => ({
          imageIndex: file.imageIndex,
          variant: 'original' as const,
          objectKey: (uploadId: string) =>
            `staging/uploads/${userId}/${uploadId}/${file.imageIndex}/original.${CONTENT_TYPE_TO_EXTENSION[file.contentType as AllowedContentType]}`,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes ?? null,
        })),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'CLIENT_UPLOAD_ID_DELETED') {
        throw new ConflictException({
          code: error.name,
          message: 'This clientUploadId belongs to a deleted upload and cannot be reused',
        });
      }
      throw error;
    }
    const upload = created.upload;
    if (!created.created) return this.handleExistingUpload(upload, dto, fileDescriptors);

    // Generate presigned upload URLs for originals
    const files = await this.generateUploadInstructions(upload, fileDescriptors);

    this.logger.log(`Upload initialized: ${upload.id} (${fileDescriptors.length} files)`);

    return {
      uploadId: upload.id,
      status: upload.status,
      files,
    };
  }

  private async validateCatalogReferences(dto: UploadInitDto): Promise<void> {
    const property = await this.catalogRepository.findPropertyById(dto.propertyId);
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const talhao = await this.catalogRepository.findTalhaoById(dto.talhaoId);
    if (!talhao) {
      throw new NotFoundException('Talhao not found');
    }
    if (talhao.propertyId !== dto.propertyId) {
      throw new BadRequestException('Talhao does not belong to the specified property');
    }

    const cropType = await this.catalogRepository.findCropTypeById(dto.cropTypeId);
    if (!cropType) {
      throw new NotFoundException('Crop type not found');
    }

    if (dto.estadioId) {
      const estadio = await this.catalogRepository.findEstadioById(dto.estadioId);
      if (!estadio) {
        throw new NotFoundException('Estadio not found');
      }
      if (estadio.cropTypeId !== dto.cropTypeId) {
        throw new BadRequestException('Estadio does not belong to the specified crop type');
      }
    }
  }

  /**
   * Handle idempotent retry for an existing upload.
   */
  private async handleExistingUpload(
    existing: Upload,
    dto: UploadInitDto,
    fileDescriptors: { imageIndex: number; contentType: string; sizeBytes?: number }[],
  ): Promise<UploadInitResponse> {
    // If upload is in a terminal or in-progress state, return current status without new URLs
    if (existing.status === 'finalizing' || existing.status === 'ready') {
      const files = await this.uploadsRepository.findFilesByUploadId(existing.id);
      return {
        uploadId: existing.id,
        status: existing.status,
        files: files
          .filter((f) => f.variant === 'original')
          .map((f) => ({
            imageIndex: f.imageIndex,
            fileId: f.id,
            uploadUrl: '',
            objectKey: f.objectKey,
            method: 'PUT' as const,
            headers: {},
            expiresAt: new Date(),
          })),
      };
    }

    // For draft or failed: check if metadata/file descriptors match
    const metadataChanged =
      existing.talhaoId !== dto.talhaoId ||
      (!existing.estadioId && existing.cropTypeId !== dto.cropTypeId) ||
      existing.estadioId !== (dto.estadioId ?? null) ||
      existing.source !== dto.source ||
      existing.activityDate.getTime() !== dto.activityDate.getTime() ||
      existing.latitude !== dto.latitude ||
      existing.longitude !== dto.longitude;

    const existingFiles = await this.uploadsRepository.findFilesByUploadId(existing.id);
    const existingOriginals = existingFiles.filter((f) => f.variant === 'original');
    const existingByIndex = new Map(existingOriginals.map((file) => [file.imageIndex, file]));

    const filesChanged =
      existingByIndex.size !== fileDescriptors.length ||
      fileDescriptors.some((descriptor) => {
        const file = existingByIndex.get(descriptor.imageIndex);
        return (
          !file ||
          !file.objectKey.endsWith(
            `original.${CONTENT_TYPE_TO_EXTENSION[descriptor.contentType as AllowedContentType]}`,
          ) ||
          (descriptor.sizeBytes !== undefined && file.sizeBytes !== descriptor.sizeBytes)
        );
      });

    if (metadataChanged || filesChanged) {
      throw new ConflictException(
        'A draft upload with this clientUploadId already exists with different metadata or file descriptors. ' +
          'Use a different clientUploadId or wait for the existing upload to be finalized.',
      );
    }

    // Return an empty URL only when the corresponding object is already in storage.
    const objectExists = await Promise.all(
      fileDescriptors.map((fd) =>
        this.storageService.headObject(existingByIndex.get(fd.imageIndex)!.objectKey),
      ),
    );
    const instructions: FileUploadInstruction[] = [];
    for (const [index, fd] of fileDescriptors.entries()) {
      const existingFile = existingByIndex.get(fd.imageIndex)!;
      const objectKey = existingFile.objectKey;

      if (objectExists[index].exists) {
        instructions.push({
          imageIndex: fd.imageIndex,
          fileId: existingFile.id,
          uploadUrl: '',
          objectKey,
          method: 'PUT',
          headers: {},
          expiresAt: new Date(),
        });
      } else {
        if (!objectKey.startsWith('staging/uploads/')) {
          throw new ConflictException('A finalized original is missing. Initialize a new upload.');
        }
        const presigned = await this.storageService.getPresignedPutUrl(
          objectKey,
          fd.contentType,
          this.presignedUrlTtlSeconds,
        );

        instructions.push({
          imageIndex: fd.imageIndex,
          fileId: existingFile.id,
          uploadUrl: presigned.url,
          objectKey: presigned.objectKey,
          method: 'PUT',
          headers: presigned.headers,
          expiresAt: presigned.expiresAt,
        });
      }
    }

    const renewed = await this.uploadsRepository.renewDraft(existing.id);
    if (!renewed) {
      const current = await this.uploadsRepository.findById(existing.id);
      if (!current) throw new NotFoundException('Upload not found');
      if (current.status === 'finalizing' || current.status === 'ready') {
        return this.handleExistingUpload(current, dto, fileDescriptors);
      }
      throw new ConflictException('Upload changed while retrying; retry initialization');
    }

    return {
      uploadId: existing.id,
      status: existing.status === 'failed' ? 'draft' : existing.status,
      files: instructions,
    };
  }

  private toMutationRecord(upload: Upload): UploadMutationResponse {
    return {
      id: upload.id,
      clientUploadId: upload.clientUploadId,
      userId: upload.userId,
      propertyId: upload.propertyId,
      talhaoId: upload.talhaoId,
      cropTypeId: upload.cropTypeId,
      estadioId: upload.estadioId,
      source: upload.source,
      status: upload.status,
      activityDate: upload.activityDate,
      latitude: upload.latitude,
      longitude: upload.longitude,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      deletedAt: upload.deletedAt,
    };
  }

  private async generateUploadInstructions(
    upload: Upload,
    fileDescriptors: { imageIndex: number; contentType: string; sizeBytes?: number }[],
  ): Promise<FileUploadInstruction[]> {
    const instructions: FileUploadInstruction[] = [];

    const existingFiles = await this.uploadsRepository.findFilesByUploadId(upload.id);
    for (const fd of fileDescriptors) {
      const ext = CONTENT_TYPE_TO_EXTENSION[fd.contentType as AllowedContentType];
      const objectKey = `staging/uploads/${upload.userId}/${upload.id}/${fd.imageIndex}/original.${ext}`;

      const fileRow = existingFiles.find(
        (file) => file.imageIndex === fd.imageIndex && file.variant === 'original',
      );
      if (!fileRow) throw new Error(`Missing original file for upload ${upload.id}`);

      const presigned = await this.storageService.getPresignedPutUrl(
        objectKey,
        fd.contentType,
        this.presignedUrlTtlSeconds,
      );

      instructions.push({
        imageIndex: fd.imageIndex,
        fileId: fileRow.id,
        uploadUrl: presigned.url,
        objectKey: presigned.objectKey,
        method: 'PUT',
        headers: presigned.headers,
        expiresAt: presigned.expiresAt,
      });
    }

    return instructions;
  }

  // ── Upload complete ────────────────────────────────────────────────

  async completeUpload(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<UploadMutationResponse> {
    const upload = await this.uploadsRepository.findById(uploadId);
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    assertOwnerOrAdmin(upload.userId, currentUser);

    if (upload.status !== 'draft' && upload.status !== 'failed') {
      throw new ConflictException(`Upload is in "${upload.status}" status and cannot be completed`);
    }

    const files = await this.uploadsRepository.findFilesByUploadId(uploadId);
    const originals = files.filter((f) => f.variant === 'original');
    if (originals.length === 0) {
      throw new BadRequestException(
        'No original files found. Upload files to the provided URLs before completing.',
      );
    }

    const observations: Array<{ id: string; observedEtag: string; sizeBytes: number }> = [];
    for (const file of originals) {
      const head = await this.storageService.headObject(file.objectKey);
      if (!head.exists || head.contentLength === undefined || head.contentLength <= 0) {
        throw new BadRequestException(
          `Original object is missing or has invalid size: ${file.objectKey}`,
        );
      }
      if (head.contentLength > this.maxFileSizeBytes) {
        throw new BadRequestException(`Original object exceeds maximum size: ${file.objectKey}`);
      }
      if (
        file.sizeBytes !== null &&
        file.sizeBytes !== undefined &&
        file.sizeBytes > 0 &&
        file.sizeBytes !== head.contentLength
      ) {
        throw new BadRequestException(
          `Declared size does not match observed size: ${file.objectKey}`,
        );
      }
      if (!head.etag)
        throw new BadRequestException(`Original object has no storage seal: ${file.objectKey}`);
      observations.push({
        id: file.id,
        observedEtag: head.etag.replace(/^"|"$/g, ''),
        sizeBytes: head.contentLength,
      });
    }

    const transitioned = await this.uploadsRepository.sealAndTransitionToFinalizing(
      uploadId,
      observations,
    );
    if (!transitioned) throw new ConflictException('Upload was completed concurrently');

    this.logger.log(`Upload ${uploadId} marked as finalizing, job enqueued`);

    const updated = await this.uploadsRepository.findById(uploadId);
    return this.toMutationRecord(updated!);
  }

  // ── Upload deletion (soft delete + delayed object deletion) ────────

  async deleteUpload(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<UploadMutationResponse> {
    const upload = await this.uploadsRepository.findByIdAnyStatus(uploadId);
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    if (upload.deletedAt) {
      throw new NotFoundException('Upload not found');
    }

    assertOwnerOrAdmin(upload.userId, currentUser);

    const runAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const deletion = await this.uploadsRepository.softDeleteAndEnqueueObjects(uploadId, runAfter, {
      actorUserId: currentUser.sub,
    });
    if (!deletion.deleted) throw new NotFoundException('Upload not found');
    const files = deletion.files;
    const jobs = files.filter((file) => file.objectKey);

    this.logger.log(
      `Upload ${uploadId} soft-deleted, ${jobs.length} deletion jobs enqueued for ${runAfter.toISOString()}`,
    );

    const updated = await this.uploadsRepository.findByIdAnyStatus(uploadId);
    return this.toMutationRecord(updated!);
  }

  // ── Query delegations ──────────────────────────────────────────────

  listUploads(dto: UploadListDto, currentUser: AuthenticatedUser): Promise<UploadListResponse> {
    return this.queryService.listUploads(dto, currentUser);
  }

  getDashboardSnapshot(currentUser: AuthenticatedUser): Promise<UploadDashboardSnapshot> {
    return this.queryService.getDashboardSnapshot(currentUser);
  }

  getUploadDetail(uploadId: string, currentUser: AuthenticatedUser): Promise<UploadDetailResponse> {
    return this.queryService.getUploadDetail(uploadId, currentUser);
  }

  getUpload(uploadId: string, currentUser: AuthenticatedUser): Promise<UploadDetailResponse> {
    return this.queryService.getUpload(uploadId, currentUser);
  }

  getFileDownloadUrl(
    uploadId: string,
    fileId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem> {
    return this.queryService.getFileDownloadUrl(uploadId, fileId, currentUser);
  }

  getFilePreviewUrl(
    uploadId: string,
    fileId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem> {
    return this.queryService.getFilePreviewUrl(uploadId, fileId, currentUser);
  }

  resolveDisplayUrls(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DisplayUrlsResponse> {
    return this.queryService.resolveDisplayUrls(uploadId, currentUser);
  }

  getExportDownloadUrls(
    dto: ExportDownloadUrlsDto,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem[]> {
    return this.queryService.getExportDownloadUrls(dto, currentUser);
  }
}
