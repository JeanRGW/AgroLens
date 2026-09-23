import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { firstValueFrom, Observable, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    context?: HttpContext,
  ): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      params: httpParams,
      withCredentials: true,
      context,
    });
  }

  post<T>(path: string, body?: unknown, context?: HttpContext): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body ?? null, {
      withCredentials: true,
      context,
    });
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body ?? null, {
      withCredentials: true,
    });
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body ?? null, {
      withCredentials: true,
    });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      withCredentials: true,
    });
  }

  // ── Promise-based convenience methods (incremental migration) ──────────

  getJson<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    context?: HttpContext,
    timeoutMs?: number,
  ): Promise<T> {
    const req$ = this.get<T>(path, params, context);
    return firstValueFrom(timeoutMs !== undefined ? req$.pipe(timeout(timeoutMs)) : req$);
  }

  postJson<T>(path: string, body?: unknown, context?: HttpContext, timeoutMs?: number): Promise<T> {
    const req$ = this.post<T>(path, body, context);
    return firstValueFrom(timeoutMs !== undefined ? req$.pipe(timeout(timeoutMs)) : req$);
  }

  putJson<T>(path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const req$ = this.put<T>(path, body);
    return firstValueFrom(timeoutMs !== undefined ? req$.pipe(timeout(timeoutMs)) : req$);
  }

  patchJson<T>(path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const req$ = this.patch<T>(path, body);
    return firstValueFrom(timeoutMs !== undefined ? req$.pipe(timeout(timeoutMs)) : req$);
  }

  deleteJson<T>(path: string, timeoutMs?: number): Promise<T> {
    const req$ = this.delete<T>(path);
    return firstValueFrom(timeoutMs !== undefined ? req$.pipe(timeout(timeoutMs)) : req$);
  }
}
