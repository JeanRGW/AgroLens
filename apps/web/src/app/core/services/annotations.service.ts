import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ImageAnnotation, SaveAnnotationInput } from '@agrolens/contracts';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root',
})
export class AnnotationsService {
  private readonly api = inject(ApiService);

  listUploadAnnotations(uploadId: string): Promise<ImageAnnotation[]> {
    return firstValueFrom(this.api.get<ImageAnnotation[]>(`/uploads/${uploadId}/annotations`));
  }

  getAnnotation(uploadId: string, imageId: string): Promise<ImageAnnotation | null> {
    return firstValueFrom(
      this.api.get<ImageAnnotation>(`/uploads/${uploadId}/annotations/${imageId}`),
    ).catch((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        return null;
      }
      throw error;
    });
  }

  upsertAnnotation(uploadId: string, input: SaveAnnotationInput): Promise<ImageAnnotation> {
    return firstValueFrom(
      this.api.put<ImageAnnotation>(`/uploads/${uploadId}/annotations/${input.imageId}`, input),
    );
  }

  /**
   * Fetch annotations for multiple uploads in parallel.
   * Returns a Map keyed by uploadId.
   */
  async listUploadAnnotationsBatch(uploadIds: string[]): Promise<Map<string, ImageAnnotation[]>> {
    const results = await Promise.all(
      uploadIds.map(async (id) => {
        const annotations = await this.listUploadAnnotations(id);
        return [id, annotations] as const;
      }),
    );
    return new Map(results);
  }
}
