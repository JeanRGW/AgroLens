import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import {
  CreateJobResponse,
  InferenceJobDetail,
  InferenceJobImageResult,
  InferenceJobListItem,
  InferenceJobListResponse,
  InferenceModelSummary,
} from '@agrolens/contracts';

@Injectable({
  providedIn: 'root',
})
export class InferenceService {
  private readonly api = inject(ApiService);

  listActiveModels(): Promise<InferenceModelSummary[]> {
    return firstValueFrom(this.api.get<InferenceModelSummary[]>('/inference/models'));
  }

  listJobs(limit = 20, offset = 0): Promise<InferenceJobListResponse> {
    return firstValueFrom(
      this.api.get<InferenceJobListResponse>('/inference/jobs', { limit, offset }),
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

  createUploadJob(
    modelId: string,
    uploadId: string,
    imageIndexes?: number[],
  ): Promise<CreateJobResponse> {
    return firstValueFrom(
      this.api.post<CreateJobResponse>('/inference/jobs', {
        modelId,
        uploadId,
        imageIndexes,
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
