import { z } from "zod";
import { pageParamsSchema, timestampDateSchema } from "./common";

export const UPLOAD_SOURCES = ["drone", "phone", "mixed"] as const;
export const uploadSourceSchema = z.enum(UPLOAD_SOURCES);
export type UploadSource = z.infer<typeof uploadSourceSchema>;

export const UPLOAD_STATUSES = [
  "draft",
  "finalizing",
  "ready",
  "failed",
] as const;
export const uploadStatusSchema = z.enum(UPLOAD_STATUSES);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

export const FILE_VARIANTS = ["original", "preview"] as const;
export const fileVariantSchema = z.enum(FILE_VARIANTS);
export type FileVariant = z.infer<typeof fileVariantSchema>;

export const fileDescriptorSchema = z.object({
  imageIndex: z.coerce.number().int().min(0).optional(),
  fileName: z.string().max(255).optional(),
  contentType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive().optional(),
});

export type FileDescriptorDto = z.infer<typeof fileDescriptorSchema>;

export const uploadInitSchema = z.object({
  clientUploadId: z.string().min(1).max(255),
  propertyId: z.string().uuid(),
  talhaoId: z.string().uuid(),
  cropTypeId: z.string().uuid(),
  estadioId: z.string().uuid().optional(),
  source: uploadSourceSchema,
  activityDate: timestampDateSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  files: z.array(fileDescriptorSchema).min(1),
});

export type UploadInitDto = z.infer<typeof uploadInitSchema>;

/**
 * Paginated upload list query schema with normalized limit/offset.
 */
export const uploadListSchema = pageParamsSchema.extend({
  propertyId: z.string().uuid().optional(),
  talhaoId: z.string().uuid().optional(),
  cropTypeId: z.string().uuid().optional(),
  estadioId: z.string().uuid().optional(),
  activityFrom: timestampDateSchema.optional(),
  activityTo: timestampDateSchema.optional(),
  createdFrom: timestampDateSchema.optional(),
  createdTo: timestampDateSchema.optional(),
  userId: z.string().uuid().optional(),
  source: uploadSourceSchema.optional(),
  status: uploadStatusSchema.optional(),
  search: z.string().max(200).optional(),
});

export type UploadListDto = z.infer<typeof uploadListSchema>;

export const EXPORT_BATCH_MAX_SIZE = 500;

export const exportFileRequestSchema = z.object({
  uploadId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
});

export type ExportFileRequest = z.infer<typeof exportFileRequestSchema>;

export const exportDownloadUrlsSchema = z.object({
  files: z
    .array(exportFileRequestSchema)
    .min(1, "At least one file must be requested")
    .max(
      EXPORT_BATCH_MAX_SIZE,
      `Maximum batch size is ${EXPORT_BATCH_MAX_SIZE}`,
    ),
});

export type ExportDownloadUrlsDto = z.infer<typeof exportDownloadUrlsSchema>;

export interface FileUploadInstruction {
  imageIndex: number;
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date | string;
}

export interface UploadInitResponse {
  uploadId: string;
  status: string;
  files: FileUploadInstruction[];
}

export interface UploadMutationResponse {
  id: string;
  clientUploadId: string;
  userId: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId: string | null;
  source: string;
  status: string;
  activityDate: Date | string;
  latitude: number;
  longitude: number;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
}

export interface UploadListItem {
  id: string;
  status: UploadStatus | string;
  source: UploadSource | string;
  activityDate: Date | string;
  latitude: number;
  longitude: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  fileCount: number;
  previewCount: number;
  userId: string;
  user?: { id: string; fullName: string | null };
  propertyId: string;
  propertyName?: string | null;
  talhaoId: string;
  talhaoName?: string | null;
  cropTypeId: string;
  cropTypeName?: string | null;
  estadioId?: string | null;
  estadioName?: string | null;
  previewFileId?: string | null;
  previewImageIndex?: number | null;
}

export interface UploadFileInfo {
  id: string;
  uploadId: string;
  imageIndex: number;
  variant: FileVariant | string;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  width?: number | null;
  height?: number | null;
  createdAt: Date | string;
}

export interface UploadDetailResponse extends UploadListItem {
  clientUploadId: string;
  errorMessage: string | null;
  files: UploadFileInfo[];
}

export interface UploadListResponse {
  uploads: UploadListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface UploadDashboardSnapshot {
  totalUploads: number;
  uploadsToday: number;
  sourceBreakdown: { drone: number; phone: number; mixed: number };
  recentUploads: Array<UploadListItem & { imageCount?: number }>;
  catalogCounts: {
    properties: number;
    talhoes: number;
    cropTypes: number;
    estadios: number;
  };
}

export interface DownloadUrlItem {
  uploadId: string;
  fileId: string;
  imageIndex: number;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  downloadUrl: string;
  expiresAt: Date | string;
}

export interface ResolvedFileUrl {
  fileId: string;
  variant: FileVariant | string;
  url: string;
}

export interface DisplayUrlsResponse {
  files: Record<string, ResolvedFileUrl>;
}

export type UnannotatedImageHandling = "exclude" | "empty-labels" | "no-labels";

export interface YoloExportOptions {
  trainRatio: number;
  includeUnannotated: UnannotatedImageHandling;
  enabledClasses: string[];
}

export type OfflineUploadStatus =
  "pending" | "syncing" | "failed" | "completed";

export interface OfflineUploadFile {
  blob?: unknown;
  contentType: string;
  fileName: string;
}

export interface OfflineUpload {
  id: string;
  userId: string;
  request: UploadInitDto;
  files: OfflineUploadFile[];
  status: OfflineUploadStatus;
  createdAt: string;
  updatedAt: string;
  backendUploadId?: string;
  errorMessage?: string;
  failureKind?: "auth" | "catalog" | "validation" | "processing" | "network";
  attempts?: number;
  retryAfter?: string;
}
