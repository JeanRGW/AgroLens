import { firstValueFrom, timeout } from 'rxjs';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface RuntimeConfig {
  inferenceEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly configState = signal<RuntimeConfig>({ inferenceEnabled: false });
  readonly config = this.configState.asReadonly();

  async load(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const config = await firstValueFrom(
        this.http.get<RuntimeConfig>('/api/health/config').pipe(timeout(3000)),
      );
      if (typeof config.inferenceEnabled !== 'boolean') {
        throw new Error('Invalid runtime configuration');
      }
      this.configState.set(config);
    } catch (error: unknown) {
      console.warn('Runtime configuration unavailable; inference remains disabled.', error);
    }
  }
}
