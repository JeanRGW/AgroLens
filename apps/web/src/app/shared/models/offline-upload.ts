import { InitUploadRequest } from './upload-record';

export type OfflineUploadStatus = 'pending' | 'syncing' | 'failed' | 'completed';

export interface OfflineUploadFile {
  blob: Blob;
  contentType: string;
  fileName: string;
}

export interface OfflineUpload {
  id: string;
  userId: string;
  request: InitUploadRequest;
  files: OfflineUploadFile[];
  status: OfflineUploadStatus;
  createdAt: string;
  updatedAt: string;
  backendUploadId?: string;
  errorMessage?: string;
  failureKind?: 'auth' | 'catalog' | 'validation' | 'processing' | 'network';
  attempts?: number;
  retryAfter?: string;
}
