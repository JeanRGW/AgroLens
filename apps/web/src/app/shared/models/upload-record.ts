import type {
  DisplayUrlsResponse,
  DownloadUrlItem,
  FileDescriptorDto,
  FileUploadInstruction,
  UploadFileInfo as ContractUploadFileInfo,
  UploadInitResponse as ContractUploadInitResponse,
  ResolvedFileUrl,
  UnannotatedImageHandling,
  UploadSource,
  UploadStatus,
  UploadInitDto,
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
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  user?: { id: string; fullName: string | null };
  previewFileId?: string | null;
}

export type UploadFileInfo = Omit<ContractUploadFileInfo, 'createdAt' | 'variant'> & {
  variant: 'original' | 'preview';
  createdAt: string;
};

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

export type InitUploadRequest = Omit<UploadInitDto, 'activityDate' | 'files'> & {
  activityDate: string;
  files: Array<FileDescriptorDto & { sizeBytes: number }>;
};

export type InitUploadFileInstruction = Omit<FileUploadInstruction, 'expiresAt'> & {
  expiresAt: string;
};

export type InitUploadResponse = Omit<ContractUploadInitResponse, 'files'> & {
  files: InitUploadFileInstruction[];
};

export interface DownloadProgress {
  phase: 'downloading' | 'packaging' | 'done';
  processed: number;
  total: number;
  percent: number;
}

export type PreviewUrlResponse = Omit<DownloadUrlItem, 'expiresAt'> & { expiresAt: string };
