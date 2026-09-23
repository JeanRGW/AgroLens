import { computed, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, from, timeout } from 'rxjs';

import { AuthService } from './auth.service';
import { OfflineCatalogCacheService } from './offline-catalog-cache.service';
import { OfflineUploadStoreService } from './offline-upload-store.service';
import { offlineErrorMessage } from '../../shared/utils/offline-errors';

@Injectable({ providedIn: 'root' })
export class OfflinePreparationService {
  private readonly auth = inject(AuthService);
  private readonly catalogs = inject(OfflineCatalogCacheService);
  private readonly store = inject(OfflineUploadStoreService);
  private readonly updates = inject(SwUpdate);
  private static readonly shellKey = 'agrolens:offline-shell-assets';
  private inflight: Promise<void> | null = null;

  readonly preparing = signal(false);
  readonly shellReady = signal(false);
  readonly storageAvailable = signal(false);
  readonly persistent = signal(false);
  readonly availableBytes = signal<number | null>(null);
  readonly error = signal('');
  readonly ready = computed(
    () =>
      !!this.auth.user() &&
      this.auth.identitySaved() &&
      this.catalogs.available() &&
      this.shellReady() &&
      this.storageAvailable(),
  );

  async prepare(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.preparing.set(true);
    this.inflight = this.doPrepare();
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
      this.preparing.set(false);
    }
  }

  private async doPrepare(): Promise<void> {
    this.error.set('');
    try {
      await this.store.checkAvailable();
      this.storageAvailable.set(true);
      if (navigator.storage) {
        this.persistent.set((await navigator.storage.persisted?.()) ?? false);
        if (!this.persistent() && navigator.storage.persist) {
          this.persistent.set(await navigator.storage.persist());
        }
        const estimate = await navigator.storage.estimate?.();
        if (estimate?.quota !== undefined && estimate.usage !== undefined) {
          this.availableBytes.set(Math.max(0, estimate.quota - estimate.usage));
        }
      }
    } catch (error) {
      this.storageAvailable.set(false);
      this.error.set(offlineErrorMessage(error));
    }

    try {
      if (!this.updates.isEnabled || !('serviceWorker' in navigator) || !('caches' in window)) {
        this.error.set(
          'O modo offline completo exige a versão de produção em HTTPS (ou localhost).',
        );
        return;
      }
      const saved: unknown = JSON.parse(
        localStorage.getItem(OfflinePreparationService.shellKey) ?? 'null',
      );
      if (Array.isArray(saved) && saved.length && saved.every((url) => typeof url === 'string')) {
        this.shellReady.set(await this.assetsCached(saved));
      }
      if (!navigator.onLine) return;

      await firstValueFrom(from(navigator.serviceWorker.ready).pipe(timeout(15000)));
      await firstValueFrom(from(this.updates.checkForUpdate()).pipe(timeout(30000)));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/ngsw.json', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Manifesto offline indisponível.');
        const manifest: { assetGroups?: { name: string; urls: unknown }[] } = await response.json();
        const urls = manifest.assetGroups?.find((group) => group.name === 'app')?.urls;
        if (!Array.isArray(urls) || !urls.length || !urls.every((url) => typeof url === 'string')) {
          throw new Error('Manifesto offline inválido.');
        }
        // An active worker alone does not prove that the initial prefetch finished.
        const cached = await this.assetsCached(urls);
        if (!cached)
          throw new Error(
            'O aplicativo ainda está sendo baixado. Prepare novamente antes de sair da conexão.',
          );
        localStorage.setItem(OfflinePreparationService.shellKey, JSON.stringify(urls));
        this.shellReady.set(true);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      this.error.set(offlineErrorMessage(error));
    }
  }

  private async assetsCached(urls: string[]): Promise<boolean> {
    const keys = (await caches.keys()).filter(
      (key) => key.startsWith('ngsw:') && key.endsWith(':assets:app:cache'),
    );
    for (const key of keys) {
      const cache = await caches.open(key);
      const matches = await Promise.all(urls.map((url) => cache.match(url)));
      if (matches.every(Boolean)) return true;
    }
    return false;
  }
}
