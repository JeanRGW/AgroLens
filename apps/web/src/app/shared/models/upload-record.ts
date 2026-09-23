import type {
  DisplayUrlsResponse,
  ResolvedFileUrl,
  UnannotatedImageHandling,
  UploadSource,
  UploadStatus,
  YoloExportOptions,
} from '@agrolens/contracts';

export type {
  DisplayUrlsResponse,
  ResolvedFileUrl,
  UnannotatedImageHandling,
  UploadSource,
  UploadStatus,
  YoloExportOptions,
};

/**
 * Web client view-models for uploads.
 *
 * Wire validation lives in @agrolens/contracts (UploadInitDto, UploadListItem,
 * UploadDetailResponse, UploadDashboardSnapshot, ...). The interfaces below are
 * the client's view projections: they carry UI state (e.g. previewFileId),
 * client-built request shapes (InitUploadRequest), and service result envelopes
 * (UploadPageResult). Naming/shape differences vs. the wire DTOs are
 * intentional — do not "unify" them by aliasing.
 */

export interface UploadMutationRecord {
  id: string;
  clientUploadId: string;
  userId: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId: string | null;
  source: UploadSource;
  status: UploadStatus;
  activityDate: string;
  latitude: number;
  longitude: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UploadRecord {
  id: string;
  userId: string;
  clientUploadId?: string;
  propertyId: string;
  propertyName?: string;
  talhaoId: string;
  talhaoName?: string;
  cropTypeId: string;
  cropTypeName?: string;
  estadioId?: string | null;
  estadioName?: string;
  source: UploadSource;
  status: UploadStatus;
  activityDate: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  user?: { id: string; fullName: string | null };
  previewFileId?: string | null;
  previewImageIndex?: number | null;
}

export interface UploadFileInfo {
  id: string;
  uploadId: string;
  imageIndex: number;
  variant: 'original' | 'preview';
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface UploadDetail {
  id: string;
  clientUploadId: string;
  userId: string;
  user?: { id: string; fullName: string | null };
  propertyId: string;
  propertyName?: string;
  talhaoId: string;
  talhaoName?: string;
  cropTypeId: string;
  cropTypeName?: string;
  estadioId: string | null;
  estadioName?: string;
  source: UploadSource;
  status: UploadStatus;
  activityDate: string;
  latitude: number;
  longitude: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  files: UploadFileInfo[];
}

export interface UploadFilters {
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
  userId?: string;
  propertyId?: string;
  talhaoId?: string;
  cropTypeId?: string;
  estadioId?: string;
  source?: UploadSource;
  status?: UploadStatus;
  search?: string;
}

export interface UploadPageResult {
  records: UploadRecord[];
  total: number;
}

export interface DashboardSnapshot {
  totalUploads: number;
  uploadsToday: number;
  sourceBreakdown: { drone: number; phone: number; mixed: number };
  recentUploads: UploadRecord[];
  catalogCounts: { properties: number; talhoes: number; cropTypes: number; estadios: number };
}

export interface InitUploadRequest {
  clientUploadId: string;
  propertyId: string;
  talhaoId: string;
  cropTypeId: string;
  estadioId?: string;
  source: UploadSource;
  activityDate: string;
  latitude: number;
  longitude: number;
  files: { fileName: string; contentType: string; sizeBytes: number }[];
}

export interface InitUploadFileInstruction {
  imageIndex: number;
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface InitUploadResponse {
  uploadId: string;
  status: string;
  files: InitUploadFileInstruction[];
}

export interface DownloadProgress {
  phase: 'downloading' | 'packaging' | 'done';
  processed: number;
  total: number;
  percent: number;
}

export interface PreviewUrlResponse {
  uploadId: string;
  fileId: string;
  imageIndex: number;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  downloadUrl: string;
  expiresAt: string;
}
