import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';

import { AuthService } from './auth.service';
import { OfflineCatalogCacheService } from './offline-catalog-cache.service';
import { OfflinePreparationService } from './offline-preparation.service';
import { OfflineUploadStoreService } from './offline-upload-store.service';
import { OfflineUploadSyncService } from './offline-upload-sync.service';
import { offlineErrorMessage } from '../../shared/utils/offline-errors';

@Injectable({ providedIn: 'root' })
export class OfflineCoordinatorService {
  private readonly auth = inject(AuthService);
  private readonly catalogs = inject(OfflineCatalogCacheService);
  private readonly preparation = inject(OfflinePreparationService);
  private readonly store = inject(OfflineUploadStoreService);
  private readonly sync = inject(OfflineUploadSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private running: Promise<void> | null = null;
  private rerunRequested = false;
  private forceCatalogsRequested = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private sessionKey = '';
  readonly online = signal(navigator.onLine);
  readonly pendingCount = signal(0);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const key = `${this.auth.user()?.id ?? ''}:${this.auth.offlineSession()}:${this.auth.reauthenticationRequired()}`;
      if (key === this.sessionKey) return;
      this.sessionKey = key;
      untracked(() => {
        this.catalogs.load();
        if (this.started) void this.run();
      });
    });
    effect(() => {
      this.store.changes();
      const userId = this.auth.user()?.id;
      untracked(() => void this.updateCount(userId));
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const wake = () => {
      this.online.set(navigator.onLine);
      if (document.visibilityState !== 'hidden') void this.run();
    };
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    window.addEventListener('pageshow', wake);
    document.addEventListener('visibilitychange', wake);
    this.destroyRef.onDestroy(() => {
      this.started = false;
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      window.removeEventListener('pageshow', wake);
      document.removeEventListener('visibilitychange', wake);
      if (this.retryTimer) clearTimeout(this.retryTimer);
    });
    void this.run();
  }

  async run(forceCatalogs = false): Promise<void> {
    this.forceCatalogsRequested ||= forceCatalogs;
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.running = this.reconcilePending();
    try {
      await this.running;
    } finally {
      this.running = null;
      if (
        this.started &&
        navigator.onLine &&
        document.visibilityState !== 'hidden' &&
        this.auth.user() &&
        !this.auth.reauthenticationRequired()
      ) {
        this.retryTimer = setTimeout(() => void this.run(), 30000);
      }
    }
  }

  private async reconcilePending(): Promise<void> {
    do {
      this.rerunRequested = false;
      const forceCatalogs = this.forceCatalogsRequested;
      this.forceCatalogsRequested = false;
      await this.reconcile(forceCatalogs);
    } while (this.rerunRequested && !this.destroyRef.destroyed);
  }

  private async reconcile(forceCatalogs: boolean): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || document.visibilityState === 'hidden') return;
    this.error.set('');
    this.catalogs.load();
    // Shell/storage preparation must also work when the server session has expired.
    const preparation =
      forceCatalogs || !this.preparation.ready() ? this.preparation.prepare() : Promise.resolve();
    try {
      if (!navigator.onLine || this.auth.reauthenticationRequired()) return;
      const token = await this.auth.ensureSession(userId);
      if (!token) return;
      this.auth.assertIdentity(userId);
      const savedAt = this.catalogs.savedAt();
      if (forceCatalogs || !savedAt || Date.now() - Date.parse(savedAt) > 300000) {
        try {
          await this.catalogs.refresh();
        } catch (error) {
          this.error.set(offlineErrorMessage(error));
        }
      }
      await this.sync.syncAll(userId, undefined, true);
    } catch (error) {
      this.error.set(offlineErrorMessage(error));
    } finally {
      await preparation;
      await this.updateCount(this.auth.user()?.id);
    }
  }

  private async updateCount(userId?: string): Promise<void> {
    if (!userId) {
      this.pendingCount.set(0);
      return;
    }
    try {
      const count = await this.store.count(userId);
      if (this.auth.user()?.id === userId) this.pendingCount.set(count);
    } catch (error) {
      this.error.set(offlineErrorMessage(error));
    }
  }
}
