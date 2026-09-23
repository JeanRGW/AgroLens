import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, or, eq, gte, lte, isNull, ilike, sql, type SQL } from 'drizzle-orm';
import {
  UploadsRepository,
  CatalogRepository,
  AccessRepository,
  AuditRepository,
  type Upload,
  type UploadFile,
} from '../database/repositories';
import {
  uploads as uploadsTable,
  users as usersTable,
  properties as propertiesTable,
  talhoes as talhoesTable,
  cropTypes as cropTypesTable,
  estadios as estadiosTable,
} from '../database/schema';
import type { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { assertCanAccessUpload } from '../auth/auth.service';
import type { UploadListDto } from './dto/upload-list.dto';
import type { ExportDownloadUrlsDto, DownloadUrlItem } from './dto/export-download.dto';
import { EXPORT_BATCH_MAX_SIZE } from './dto/export-download.dto';
import type { DisplayUrlsResponse, ResolvedFileUrl } from './dto/display-urls.dto';
import type {
  UploadListResponse,
  UploadDetailResponse,
  UploadDashboardSnapshot,
  UploadListItem,
} from './upload-types';
import { StorageService } from '../storage/storage.service';

/**
 * Free-text search condition over upload ID (as text) and joined
 * user/property/talhao/crop type/estadio display names.
 */
export function buildUploadSearchCondition(search: string): SQL {
  const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const pattern = `%${escaped}%`;

  return or(
    sql`cast(${uploadsTable.id} as text) ilike ${pattern}`,
    ilike(usersTable.fullName, pattern),
    ilike(propertiesTable.name, pattern),
    ilike(talhoesTable.name, pattern),
    ilike(cropTypesTable.name, pattern),
    ilike(estadiosTable.name, pattern),
  )!;
}

@Injectable()
export class UploadQueryService {
  private readonly logger = new Logger(UploadQueryService.name);
  private readonly presignedUrlTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly accessRepository: AccessRepository,
    private readonly auditRepository: AuditRepository,
    private readonly storageService: StorageService,
  ) {
    this.presignedUrlTtlSeconds = this.configService.get<number>(
      'UPLOAD_PRESIGNED_URL_TTL_SECONDS',
      900,
    );
  }

  // ── Upload list ────────────────────────────────────────────────────

  async listUploads(
    dto: UploadListDto,
    currentUser: AuthenticatedUser,
  ): Promise<UploadListResponse> {
    const userId = currentUser.sub;
    const isAdmin = currentUser.role === 'admin';

    // Build where conditions
    const conditions: SQL[] = [
      eq(uploadsTable.status, dto.status ?? 'ready'),
      isNull(uploadsTable.deletedAt),
    ];

    if (!isAdmin) {
      conditions.push(
        or(
          eq(uploadsTable.userId, userId),
          and(eq(uploadsTable.status, 'ready'), this.grantAccessExists(userId))!,
        )!,
      );
    }

    // Optional filters
    if (dto.propertyId) {
      conditions.push(eq(talhoesTable.propertyId, dto.propertyId));
    }
    if (dto.talhaoId) {
      conditions.push(eq(uploadsTable.talhaoId, dto.talhaoId));
    }
    if (dto.cropTypeId) {
      conditions.push(eq(uploadsTable.cropTypeId, dto.cropTypeId));
    }
    if (dto.estadioId) {
      conditions.push(eq(uploadsTable.estadioId, dto.estadioId));
    }
    if (dto.activityFrom) {
      conditions.push(gte(uploadsTable.activityDate, dto.activityFrom));
    }
    if (dto.activityTo) {
      conditions.push(lte(uploadsTable.activityDate, dto.activityTo));
    }
    if (dto.createdFrom) {
      conditions.push(gte(uploadsTable.createdAt, dto.createdFrom));
    }
    if (dto.createdTo) {
      conditions.push(lte(uploadsTable.createdAt, dto.createdTo));
    }
    if (dto.userId) {
      conditions.push(eq(uploadsTable.userId, dto.userId));
    }
    if (dto.source) {
      conditions.push(eq(uploadsTable.source, dto.source));
    }
    if (dto.search) {
      conditions.push(buildUploadSearchCondition(dto.search));
    }

    const whereClause = and(...conditions);

    const count = dto.search
      ? await this.uploadsRepository.countWhereEnriched(whereClause)
      : await this.uploadsRepository.countWhere(whereClause);

    const rows = await this.uploadsRepository.listWhereEnriched(whereClause, dto.limit, dto.offset);

    const uploadIds = rows.map((r) => r.id);
    const [fileCounts, previewCounts, previewFiles] =
      uploadIds.length > 0
        ? await Promise.all([
            this.uploadsRepository.countOriginalsByUploadIds(uploadIds),
            this.uploadsRepository.countPreviewsByUploadIds(uploadIds),
            this.uploadsRepository.findFirstPreviewByUploadIds(uploadIds),
          ])
        : [new Map<string, number>(), new Map<string, number>(), new Map<string, UploadFile>()];

    const uploadList: UploadListItem[] = rows.map((r) => {
      const preview = previewFiles.get(r.id);
      return {
        id: r.id,
        status: r.status,
        source: r.source,
        activityDate: r.activityDate,
        latitude: r.latitude,
        longitude: r.longitude,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        fileCount: fileCounts.get(r.id) ?? 0,
        previewCount: previewCounts.get(r.id) ?? 0,
        userId: r.userId,
        user: { id: r.userId, fullName: r.userFullName },
        propertyId: r.propertyId,
        propertyName: r.propertyName,
        talhaoId: r.talhaoId,
        talhaoName: r.talhaoName,
        cropTypeId: r.cropTypeId,
        cropTypeName: r.cropTypeName,
        estadioId: r.estadioId,
        estadioName: r.estadioName,
        previewFileId: preview?.id ?? null,
        previewImageIndex: preview?.imageIndex ?? null,
      };
    });

    return {
      uploads: uploadList,
      total: count,
      limit: dto.limit,
      offset: dto.offset,
    };
  }

  // ── Dashboard snapshot ─────────────────────────────────────────────

  async getDashboardSnapshot(currentUser: AuthenticatedUser): Promise<UploadDashboardSnapshot> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [recentPage, todayPage, propertyCount, talhaoCount, cropTypeCount, estadioCount] =
      await Promise.all([
        this.listUploads({ limit: 20, offset: 0 }, currentUser),
        this.listUploads({ limit: 1, offset: 0, createdFrom: today }, currentUser),
        this.catalogRepository.countProperties(),
        this.catalogRepository.countTalhoes(),
        this.catalogRepository.countCropTypes(),
        this.catalogRepository.countEstadios(),
      ]);

    const sourceBreakdown = recentPage.uploads.reduce(
      (acc, upload) => {
        if (upload.source === 'drone' || upload.source === 'phone' || upload.source === 'mixed') {
          acc[upload.source] += 1;
        }
        return acc;
      },
      { drone: 0, phone: 0, mixed: 0 },
    );

    return {
      totalUploads: recentPage.total,
      uploadsToday: todayPage.total,
      sourceBreakdown,
      recentUploads: recentPage.uploads.slice(0, 5).map((upload) => ({
        ...upload,
        imageCount: upload.fileCount,
      })),
      catalogCounts: {
        properties: propertyCount,
        talhoes: talhaoCount,
        cropTypes: cropTypeCount,
        estadios: estadioCount,
      },
    };
  }

  // ── Upload detail ──────────────────────────────────────────────────

  async getUploadDetail(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<UploadDetailResponse> {
    const upload = await assertCanAccessUpload(
      this.uploadsRepository,
      this.accessRepository,
      uploadId,
      currentUser,
    );

    const [enrichedRow, files] = await Promise.all([
      this.uploadsRepository.findByIdEnriched(uploadId),
      this.uploadsRepository.findFilesByUploadId(uploadId),
    ]);

    const userFullName = enrichedRow?.userFullName ?? null;
    const propertyName = enrichedRow?.propertyName ?? null;
    const talhaoName = enrichedRow?.talhaoName ?? null;
    const cropTypeName = enrichedRow?.cropTypeName ?? null;
    const estadioName = enrichedRow?.estadioName ?? null;
    const originals = files.filter((f) => f.variant === 'original');
    const previews = files.filter((f) => f.variant === 'preview');
    const previewFileId = previews.length > 0 ? previews[0].id : null;

    return {
      id: upload.id,
      clientUploadId: upload.clientUploadId,
      userId: upload.userId,
      user: { id: upload.userId, fullName: userFullName },
      propertyId: upload.propertyId,
      propertyName,
      talhaoId: upload.talhaoId,
      talhaoName,
      cropTypeId: upload.cropTypeId,
      cropTypeName,
      estadioId: upload.estadioId,
      estadioName,
      source: upload.source,
      status: upload.status,
      activityDate: upload.activityDate,
      latitude: upload.latitude,
      longitude: upload.longitude,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      fileCount: originals.length,
      previewCount: previews.length,
      previewFileId,
      files,
    };
  }

  getUpload(uploadId: string, currentUser: AuthenticatedUser): Promise<UploadDetailResponse> {
    return this.getUploadDetail(uploadId, currentUser);
  }

  // ── Single file download URL ─────────────────────────────────────────

  async getFileDownloadUrl(
    uploadId: string,
    fileId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem> {
    return this.getFileSignedUrl(uploadId, fileId, currentUser, 'original');
  }

  // ── Single preview file signed URL ──────────────────────────────────

  async getFilePreviewUrl(
    uploadId: string,
    fileId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem> {
    return this.getFileSignedUrl(uploadId, fileId, currentUser, 'preview');
  }

  async resolveDisplayUrls(
    uploadId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DisplayUrlsResponse> {
    const upload = await this.uploadsRepository.findById(uploadId);
    if (!upload || upload.status !== 'ready') {
      throw new NotFoundException('Upload not found or not ready');
    }

    if (!(await this.isDownloadAllowed(upload, currentUser))) {
      throw new NotFoundException('Upload not found or not ready');
    }

    const files = (await this.uploadsRepository.findFilesByUploadId(uploadId)).filter(
      (file) => file.objectKey && (file.variant === 'original' || file.variant === 'preview'),
    );
    const resolved = await Promise.all(
      files.map(async (file): Promise<ResolvedFileUrl> => {
        const { url } = await this.storageService.getPresignedGetUrl(
          file.objectKey!,
          this.presignedUrlTtlSeconds,
        );
        return {
          fileId: file.id,
          variant: file.variant as ResolvedFileUrl['variant'],
          url,
        };
      }),
    );

    this.auditRepository
      .create({
        eventType: 'display_urls_issued',
        actorUserId: currentUser.sub,
        resourceType: 'upload',
        resourceId: uploadId,
        metadata: {
          uploadId,
          fileIds: resolved.map((file) => file.fileId),
          count: resolved.length,
        },
      })
      .catch((err: unknown) => this.warnBestEffortAuditFailure('display_urls_issued', err));

    return { files: Object.fromEntries(resolved.map((file) => [file.fileId, file])) };
  }

  // ── Batch export download URLs ───────────────────────────────────────

  async getExportDownloadUrls(
    dto: ExportDownloadUrlsDto,
    currentUser: AuthenticatedUser,
  ): Promise<DownloadUrlItem[]> {
    const userId = currentUser.sub;
    const isAdmin = currentUser.role === 'admin';

    const uploadIdSet = new Set(dto.files.map((f) => f.uploadId));
    const uploadIds = [...uploadIdSet];

    if (uploadIds.length > EXPORT_BATCH_MAX_SIZE) {
      throw new BadRequestException(
        `Too many distinct uploads. Maximum is ${EXPORT_BATCH_MAX_SIZE}`,
      );
    }

    const uploads = await this.uploadsRepository.listByIds(uploadIds);
    const uploadMap = new Map(uploads.map((u) => [u.id, u]));

    for (const uploadId of uploadIds) {
      const upload = uploadMap.get(uploadId);
      if (!upload || upload.status !== 'ready') {
        throw new NotFoundException(`Upload ${uploadId} not found or not ready`);
      }
      if (!isAdmin && upload.userId !== userId) {
        const isAllowed = await this.accessRepository.hasAnyActiveGrantForUpload(userId, {
          uploadId: upload.id,
          propertyId: upload.propertyId,
          talhaoId: upload.talhaoId,
          cropTypeId: upload.cropTypeId,
          estadioId: upload.estadioId,
        });
        if (!isAllowed) {
          throw new NotFoundException(`Upload ${uploadId} not found or not ready`);
        }
      }
    }

    const originals = await this.uploadsRepository.findOriginalsByUploadIds(uploadIds);
    const filesById = new Map(originals.map((file) => [file.id, file]));
    const filesByUpload = new Map<string, UploadFile[]>();
    for (const file of originals) {
      if (!file.objectKey) continue;
      const group = filesByUpload.get(file.uploadId) ?? [];
      group.push(file);
      filesByUpload.set(file.uploadId, group);
    }

    const requestedFiles = dto.files.flatMap((req) => {
      if (!req.fileId) return filesByUpload.get(req.uploadId) ?? [];
      const file = filesById.get(req.fileId);
      if (!file || file.uploadId !== req.uploadId || !file.objectKey) {
        throw new NotFoundException(`File ${req.fileId} not found in upload ${req.uploadId}`);
      }
      return [file];
    });
    const items: DownloadUrlItem[] = [];
    for (const file of requestedFiles) {
      const { url, expiresAt } = await this.storageService.getPresignedGetUrl(
        file.objectKey,
        this.presignedUrlTtlSeconds,
      );
      items.push({
        uploadId: file.uploadId,
        fileId: file.id,
        imageIndex: file.imageIndex,
        fileName: file.objectKey.split('/').pop() ?? file.objectKey,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        downloadUrl: url,
        expiresAt,
      });
    }

    this.auditExportUrlsIssued(
      currentUser.sub,
      uploadIds,
      items.map((item) => item.fileId),
    ).catch((err: unknown) => this.warnBestEffortAuditFailure('export_urls_issued', err));

    return items;
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async isDownloadAllowed(
    upload: Upload,
    currentUser: AuthenticatedUser,
  ): Promise<boolean> {
    if (currentUser.role === 'admin') return true;
    if (upload.userId === currentUser.sub) return true;
    return this.accessRepository.hasAnyActiveGrantForUpload(currentUser.sub, {
      uploadId: upload.id,
      propertyId: upload.propertyId,
      talhaoId: upload.talhaoId,
      cropTypeId: upload.cropTypeId,
      estadioId: upload.estadioId,
    });
  }

  private async getFileSignedUrl(
    uploadId: string,
    fileId: string,
    currentUser: AuthenticatedUser,
    variant: 'original' | 'preview',
  ): Promise<DownloadUrlItem> {
    const upload = await this.uploadsRepository.findById(uploadId);
    if (!upload || upload.status !== 'ready') {
      throw new NotFoundException('Upload not found or not ready');
    }

    if (!(await this.isDownloadAllowed(upload, currentUser))) {
      throw new NotFoundException('Upload not found or not ready');
    }

    const file = await this.uploadsRepository.findFileById(fileId);
    if (!file || file.uploadId !== uploadId || file.variant !== variant || !file.objectKey) {
      throw new NotFoundException(
        variant === 'preview' ? 'Preview file not found' : 'File not found',
      );
    }

    const { url, expiresAt } = await this.storageService.getPresignedGetUrl(
      file.objectKey,
      this.presignedUrlTtlSeconds,
    );

    this.auditDownloadUrlIssued(currentUser.sub, uploadId, fileId).catch((err) =>
      this.warnBestEffortAuditFailure(
        variant === 'preview' ? 'preview_url_issued' : 'download_url_issued',
        err,
      ),
    );

    return {
      uploadId,
      fileId: file.id,
      imageIndex: file.imageIndex,
      fileName: file.objectKey.split('/').pop() ?? file.objectKey,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      downloadUrl: url,
      expiresAt,
    };
  }

  private async auditDownloadUrlIssued(
    actorUserId: string,
    uploadId: string,
    fileId: string,
  ): Promise<void> {
    await this.auditRepository.create({
      eventType: 'download_url_issued',
      actorUserId,
      resourceType: 'upload_file',
      resourceId: fileId,
      metadata: { uploadId },
    });
  }

  private async auditExportUrlsIssued(
    actorUserId: string,
    uploadIds: string[],
    fileIds: string[],
  ): Promise<void> {
    await this.auditRepository.create({
      eventType: 'export_urls_issued',
      actorUserId,
      resourceType: 'upload',
      resourceId: uploadIds[0] ?? 'batch',
      metadata: { uploadIds, fileIds, count: fileIds.length },
    });
  }

  private warnBestEffortAuditFailure(eventType: string, error: unknown): void {
    const reason = error instanceof Error ? error.name : 'unknown_error';
    this.logger.warn(JSON.stringify({ event: 'audit_best_effort_failed', eventType, reason }));
  }

  private grantAccessExists(userId: string): SQL {
    return sql`EXISTS (
      SELECT 1 FROM access_grants grant_row
      WHERE grant_row.subject_user_id = ${userId}
        AND grant_row.revoked_at IS NULL
        AND (
          (grant_row.resource_type = 'upload' AND grant_row.resource_id = ${uploadsTable.id})
          OR (grant_row.resource_type = 'property' AND grant_row.resource_id = ${talhoesTable.propertyId})
          OR (grant_row.resource_type = 'talhao' AND grant_row.resource_id = ${uploadsTable.talhaoId})
          OR (grant_row.resource_type = 'crop_type' AND grant_row.resource_id = ${uploadsTable.cropTypeId})
          OR (grant_row.resource_type = 'estadio' AND grant_row.resource_id = ${uploadsTable.estadioId})
        )
    )`;
  }
}
