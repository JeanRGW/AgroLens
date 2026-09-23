import { inject, Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';

import { ApiService } from './api.service';
import type { DownloadUrlItem } from '@agrolens/contracts';
import {
  DashboardSnapshot,
  DisplayUrlsResponse,
  InitUploadRequest,
  InitUploadResponse,
  PreviewUrlResponse,
  UploadDetail,
  UploadFilters,
  UploadMutationRecord,
  UploadPageResult,
  UploadRecord,
} from '../../shared/models/upload-record';

@Injectable({
  providedIn: 'root',
})
export class UploadsService {
  private readonly api = inject(ApiService);

  listUploads(filters?: UploadFilters, limit?: number, offset?: number): Promise<UploadPageResult> {
    const params: Record<string, string | number | boolean | undefined> = {
      limit: limit ?? 20,
      offset: offset ?? 0,
    };
    if (filters) {
      if (filters.createdFrom) params['createdFrom'] = filters.createdFrom;
      if (filters.createdTo) params['createdTo'] = filters.createdTo;
      if (filters.activityFrom) params['activityFrom'] = filters.activityFrom;
      if (filters.activityTo) params['activityTo'] = filters.activityTo;
      if (filters.userId) params['userId'] = filters.userId;
      if (filters.propertyId) params['propertyId'] = filters.propertyId;
      if (filters.talhaoId) params['talhaoId'] = filters.talhaoId;
      if (filters.cropTypeId) params['cropTypeId'] = filters.cropTypeId;
      if (filters.estadioId) params['estadioId'] = filters.estadioId;
      if (filters.source) params['source'] = filters.source;
      if (filters.status) params['status'] = filters.status;
      if (filters.search) params['search'] = filters.search;
    }
    return this.api
      .getJson<{ uploads: UploadRecord[]; total: number; limit: number; offset: number }>(
        '/uploads',
        params,
      )
      .then((res) => ({
        records: res.uploads,
        total: res.total,
      }));
  }

  getUpload(id: string, context?: HttpContext, timeoutMs = 20000): Promise<UploadDetail> {
    return this.api.getJson<UploadDetail>(`/uploads/${id}`, undefined, context, timeoutMs);
  }

  initUpload(req: InitUploadRequest, context?: HttpContext): Promise<InitUploadResponse> {
    return this.api.postJson<InitUploadResponse>('/uploads/init', req, context, 20000);
  }

  completeUpload(id: string, context?: HttpContext): Promise<UploadMutationRecord> {
    return this.api
      .postJson<{ upload: UploadMutationRecord }>(
        `/uploads/${id}/complete`,
        undefined,
        context,
        20000,
      )
      .then((res) => res.upload);
  }

  deleteUpload(id: string): Promise<UploadMutationRecord> {
    return this.api
      .deleteJson<{ upload: UploadMutationRecord }>(`/uploads/${id}`)
      .then((res) => res.upload);
  }

  getDownloadUrl(uploadId: string, fileId: string): Promise<{ downloadUrl: string }> {
    return this.api.getJson<{ downloadUrl: string }>(
      `/uploads/${uploadId}/files/${fileId}/download-url`,
    );
  }

  getPreviewUrl(uploadId: string, fileId: string): Promise<PreviewUrlResponse> {
    return this.api.getJson<PreviewUrlResponse>(`/uploads/${uploadId}/files/${fileId}/preview-url`);
  }

  getDisplayUrls(uploadId: string): Promise<DisplayUrlsResponse> {
    return this.api.getJson<DisplayUrlsResponse>(`/uploads/${uploadId}/display-urls`);
  }

  getExportDownloadUrls(
    items: { uploadId: string; fileId?: string }[],
  ): Promise<DownloadUrlItem[]> {
    return this.api.postJson<DownloadUrlItem[]>('/uploads/export-download-urls', {
      files: items,
    });
  }

  getDashboardSnapshot(): Promise<DashboardSnapshot> {
    return this.api.getJson<DashboardSnapshot>('/uploads/dashboard');
  }
}
