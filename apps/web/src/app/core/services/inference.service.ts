import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import {
  CreateJobResponse,
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobListResponse,
  InferenceModelSummary,
  ReviewedDetection,
  InferenceReviewResponse,
} from '@agrolens/contracts';

@Injectable({
  providedIn: 'root',
})
export class InferenceService {
  private readonly api = inject(ApiService);

  listActiveModels(): Promise<InferenceModelSummary[]> {
    return firstValueFrom(this.api.get<InferenceModelSummary[]>('/inference/models'));
  }

  listJobs(limit = 20, offset = 0, uploadId?: string): Promise<InferenceJobListResponse> {
    return firstValueFrom(
      this.api.get<InferenceJobListResponse>('/inference/jobs', {
        limit,
        offset,
        ...(uploadId ? { uploadId } : {}),
      }),
    );
  }

  getJob(id: string): Promise<InferenceJobDetail> {
    return firstValueFrom(this.api.get<InferenceJobDetail>(`/inference/jobs/${id}`));
  }

  getImage(jobId: string, imageId: string): Promise<InferenceJobImageResult> {
    return firstValueFrom(
      this.api.get<InferenceJobImageResult>(`/inference/jobs/${jobId}/images/${imageId}`),
    );
  }

  saveReview(
    jobId: string,
    imageId: string,
    detections: ReviewedDetection[] | null,
    expectedUpdatedAt: string,
  ): Promise<InferenceReviewResponse> {
    return firstValueFrom(
      this.api.post<InferenceReviewResponse>(`/inference/jobs/${jobId}/images/${imageId}/review`, {
        detections,
        expectedUpdatedAt,
      }),
    );
  }

  createUploadJob(
    modelId: string,
    uploadId: string,
    imageIds?: string[],
  ): Promise<CreateJobResponse> {
    return firstValueFrom(
      this.api.post<CreateJobResponse>('/inference/jobs', {
        modelId,
        uploadId,
        imageIds,
      }),
    );
  }

  createTempJob(
    modelId: string,
    files: { fileName: string; contentType: string; sizeBytes: number }[],
  ): Promise<CreateJobResponse> {
    return firstValueFrom(
      this.api.post<CreateJobResponse>('/inference/jobs', {
        modelId,
        files,
      }),
    );
  }

  completeTempJob(jobId: string): Promise<{ status: string }> {
    return firstValueFrom(this.api.post<{ status: string }>(`/inference/jobs/${jobId}/complete`));
  }

  deleteJob(jobId: string): Promise<void> {
    return firstValueFrom(this.api.delete<void>(`/inference/jobs/${jobId}`));
  }
}
