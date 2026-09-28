import type { UploadFile } from '../database/repositories';
// ── Response types ───────────────────────────────────────────────────

export interface FileUploadInstruction {
  imageId: string;
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
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
  activityDate: Date;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UploadListItem {
  id: string;
  status: string;
  source: string;
  activityDate: Date;
  createdAt: Date;
  updatedAt: Date;
  fileCount: number;
  previewCount: number;
  userId: string;
  user: { id: string; fullName: string | null };
  propertyId: string;
  propertyName: string | null;
  talhaoId: string;
  talhaoName: string | null;
  cropTypeId: string;
  cropTypeName: string | null;
  estadioId: string | null;
  estadioName: string | null;
  previewFileId: string | null;
}

export interface UploadDetailResponse {
  id: string;
  clientUploadId: string;
  userId: string;
  user: { id: string; fullName: string | null };
  propertyId: string;
  propertyName: string | null;
  talhaoId: string;
  talhaoName: string | null;
  cropTypeId: string;
  cropTypeName: string | null;
  estadioId: string | null;
  estadioName: string | null;
  source: string;
  status: string;
  activityDate: Date;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  fileCount: number;
  previewCount: number;
  previewFileId: string | null;
  files: UploadFile[];
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
  recentUploads: Array<UploadListItem & { imageCount: number }>;
  catalogCounts: { properties: number; talhoes: number; cropTypes: number; estadios: number };
}
