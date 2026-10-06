import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { InferenceModelAdmin, InferenceModelInitResponse } from '@agrolens/contracts';

@Injectable({
  providedIn: 'root',
})
export class InferenceModelsService {
  private readonly api = inject(ApiService);

  initModel(name: string, description?: string): Promise<InferenceModelInitResponse> {
    return firstValueFrom(
      this.api.post<InferenceModelInitResponse>('/admin/inference-models/init', {
        name,
        description,
      }),
    );
  }

  completeModelUpload(id: string): Promise<InferenceModelAdmin> {
    return firstValueFrom(
      this.api.post<InferenceModelAdmin>(`/admin/inference-models/${id}/complete`),
    );
  }

  listModels(): Promise<InferenceModelAdmin[]> {
    return firstValueFrom(this.api.get<InferenceModelAdmin[]>('/admin/inference-models'));
  }

  updateModel(
    id: string,
    updates: { name?: string; description?: string | null },
  ): Promise<InferenceModelAdmin> {
    return firstValueFrom(
      this.api.patch<InferenceModelAdmin>(`/admin/inference-models/${id}`, updates),
    );
  }

  setModelActive(id: string, active: boolean): Promise<InferenceModelAdmin> {
    return firstValueFrom(
      this.api.patch<InferenceModelAdmin>(`/admin/inference-models/${id}/active`, { active }),
    );
  }

  deleteModel(id: string): Promise<void> {
    return firstValueFrom(this.api.delete<void>(`/admin/inference-models/${id}`));
  }
}
