import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { OfflineUpload } from '../../shared/models/offline-upload';
import { AuthService } from './auth.service';
import { OfflineUploadStoreService } from './offline-upload-store.service';
import {
  UploadCreateProgress,
  UploadCreateService,
  UploadFileTransferError,
  UploadProcessingError,
} from './upload-create.service';
import { SessionIdentityError } from '../interceptors/auth-context';
import { offlineErrorMessage, validateUploadImages } from '../../shared/utils/offline-errors';
import { withBrowserLock } from '../../shared/utils/browser-lock';

@Injectable({ providedIn: 'root' })
export class OfflineUploadSyncService {
  private readonly authService = inject(AuthService);
  private readonly store = inject(OfflineUploadStoreService);
  private readonly uploadCreateService = inject(UploadCreateService);
  private readonly inflight = new Map<string, Promise<OfflineUpload>>();
  private readonly active = signal(0);
  readonly syncing = computed(() => this.active() > 0);
  readonly error = signal('');

  async sync(
    upload: OfflineUpload,
    onProgress?: (progress: UploadCreateProgress) => void,
  ): Promise<OfflineUpload> {
    const existing = this.inflight.get(upload.id);
    if (existing) return existing;
    this.active.update((value) => value + 1);
    const run = async () => {
      const latest = await this.store.get(upload.id);
      if (!latest) return { ...upload, status: 'completed' as const };
      return this.syncUnlocked(latest, onProgress);
    };
    // The lock also covers other tabs; a stale reader must not resurrect a completed batch.
    const promise = withBrowserLock(`agrolens-upload:${upload.id}`, run);
    this.inflight.set(upload.id, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(upload.id);
      this.active.update((value) => value - 1);
    }
  }

  async syncAll(
    userId: string,
    onProgress?: (upload: OfflineUpload) => void,
    automatic = false,
  ): Promise<void> {
    const uploads = await this.store.list(userId);
    for (const upload of uploads) {
      if (upload.status === 'completed') continue;
      if (
        !navigator.onLine ||
        this.authService.user()?.id !== userId ||
        this.authService.reauthenticationRequired()
      )
        break;
      if (automatic && !this.canAutoSync(upload)) continue;
      const result = await this.sync(upload);
      onProgress?.(result);
    }
  }

  canAutoSync(upload: OfflineUpload): boolean {
    return (
      upload.status !== 'completed' &&
      upload.failureKind !== 'catalog' &&
      upload.failureKind !== 'validation' &&
      upload.failureKind !== 'processing' &&
      (!upload.retryAfter || Date.parse(upload.retryAfter) <= Date.now())
    );
  }

  private async syncUnlocked(
    upload: OfflineUpload,
    onProgress?: (progress: UploadCreateProgress) => void,
  ): Promise<OfflineUpload> {
    let current = upload;
    let validatingFiles = false;
    try {
      if (!navigator.onLine) {
        throw new Error('Sem conexão. Conecte-se à internet para sincronizar a fila.');
      }

      if (this.authService.user()?.id !== upload.userId) throw new SessionIdentityError();
      const token = await this.authService.ensureSession(upload.userId);
      if (!token) {
        throw new Error('Sua sessão expirou. Entre novamente antes de sincronizar a fila.');
      }
      this.authService.assertIdentity(upload.userId);
      validatingFiles = true;
      validateUploadImages(
        upload.files.map((file) => ({ type: file.contentType, size: file.blob.size })),
      );
      validatingFiles = false;

      const syncing: OfflineUpload = {
        ...upload,
        status: 'syncing',
        errorMessage: undefined,
        failureKind: undefined,
        retryAfter: undefined,
        updatedAt: now(),
      };
      current = syncing;
      await this.store.save(syncing);

      const files = syncing.files.map(
        (file) => new File([file.blob], file.fileName, { type: file.contentType }),
      );
      const detail = await this.uploadCreateService.createUpload(
        syncing.request,
        files,
        onProgress,
        {
          userId: syncing.userId,
          assertIdentity: () => this.authService.assertIdentity(syncing.userId),
          onInitialized: async (backendUploadId) => {
            current = { ...current, backendUploadId, updatedAt: now() };
            await this.store.save(current);
          },
        },
      );
      this.authService.assertIdentity(syncing.userId);
      if (detail.userId !== syncing.userId) throw new SessionIdentityError();
      if (detail.status !== 'ready') throw new Error('O servidor ainda não confirmou o upload.');
      await this.store.delete(syncing.id);
      this.error.set('');
      return {
        ...syncing,
        status: 'completed',
        backendUploadId: detail.id,
        updatedAt: now(),
      };
    } catch (error) {
      const failureKind = this.failureKind(error, validatingFiles);
      const attempts = (upload.attempts ?? 0) + 1;
      const message =
        failureKind === 'catalog'
          ? 'Um catálogo deste lote não está mais disponível. Atualize os catálogos e corrija o lote.'
          : failureKind === 'auth'
            ? 'Entre com a conta que salvou este lote para sincronizá-lo. A coleta offline continua disponível.'
            : offlineErrorMessage(error);
      const failed: OfflineUpload = {
        ...current,
        status: 'failed',
        errorMessage: message,
        failureKind,
        attempts,
        retryAfter:
          failureKind === 'network'
            ? new Date(
                Date.now() + Math.min(300000, 5000 * 2 ** Math.min(attempts - 1, 6)),
              ).toISOString()
            : undefined,
        updatedAt: now(),
      };
      await this.store.save(failed);
      this.error.set(message);
      return failed;
    }
  }

  private failureKind(error: unknown, validatingFiles: boolean): OfflineUpload['failureKind'] {
    if (error instanceof UploadProcessingError) return 'processing';
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (
      error instanceof SessionIdentityError ||
      this.authService.reauthenticationRequired() ||
      status === 401 ||
      status === 403
    )
      return 'auth';
    if (error instanceof UploadFileTransferError) {
      // Storage authorization failures need fresh presigned URLs, not a new app login.
      return [400, 409, 413, 415, 422].includes(error.status) ? 'validation' : 'network';
    }
    if (
      status === 404 ||
      (status === 400 && /property|talhao|crop|estadio/i.test(offlineErrorMessage(error)))
    )
      return 'catalog';
    if (validatingFiles || [400, 409, 413, 415, 422].includes(status)) return 'validation';
    return 'network';
  }
}

function now(): string {
  return new Date().toISOString();
}
