import { Injectable } from '@angular/core';

export interface PresignedUploadOptions {
  method?: string;
  headers?: Record<string, string>;
  onProgress?: (progressPercent: number) => void;
  signal?: AbortSignal;
}

export interface PresignedUploadResult {
  ok: boolean;
  status: number;
  statusText: string;
}

@Injectable({
  providedIn: 'root',
})
export class PresignedUploadService {
  /**
   * Uploads a file/blob to a presigned URL.
   * If onProgress callback is supplied, uses XMLHttpRequest to report progress.
   * Otherwise uses fetch API.
   */
  putFile(
    url: string,
    file: Blob | File,
    options?: PresignedUploadOptions,
  ): Promise<PresignedUploadResult> {
    if (options?.onProgress) {
      return this.uploadWithXhr(url, file, options);
    }
    return this.uploadWithFetch(url, file, options);
  }

  private async uploadWithFetch(
    url: string,
    file: Blob | File,
    options?: PresignedUploadOptions,
  ): Promise<PresignedUploadResult> {
    const response = await fetch(url, {
      method: options?.method || 'PUT',
      body: file,
      headers: options?.headers,
      signal: options?.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  }

  private uploadWithXhr(
    url: string,
    file: Blob | File,
    options: PresignedUploadOptions,
  ): Promise<PresignedUploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || 'PUT', url);

      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          xhr.setRequestHeader(key, value);
        }
      }

      if (options.onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            options.onProgress?.(Math.round((evt.loaded / evt.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
        });
      };

      xhr.onerror = () => reject(new Error('Erro de rede durante o upload.'));

      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          reject(new DOMException('The user aborted a request.', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      }

      xhr.send(file);
    });
  }
}
