import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { OfflineUpload } from '../../shared/models/offline-upload';

@Injectable({ providedIn: 'root' })
export class OfflineUploadStoreService {
  private static readonly databaseName = 'agrolens-offline';
  private static readonly storeName = 'uploads';
  private databasePromise: Promise<IDBDatabase> | null = null;
  readonly changes = signal(0);
  private readonly channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('agrolens-offline-uploads');

  constructor() {
    if (this.channel) this.channel.onmessage = () => this.changes.update((value) => value + 1);
    inject(DestroyRef).onDestroy(() => {
      this.channel?.close();
      void this.databasePromise?.then((database) => database.close()).catch(() => undefined);
    });
  }

  async checkAvailable(): Promise<void> {
    await this.run('readonly', (store) => store.count());
  }

  async save(upload: OfflineUpload): Promise<void> {
    await this.run('readwrite', (store) => store.put(upload));
    this.notify();
  }

  async get(id: string): Promise<OfflineUpload | undefined> {
    return this.run('readonly', (store) => store.get(id));
  }

  async count(userId: string): Promise<number> {
    return this.run('readonly', (store) => store.index('userId').count(userId));
  }

  async list(userId: string): Promise<OfflineUpload[]> {
    const uploads = await this.run('readonly', (store) => store.index('userId').getAll(userId));
    return uploads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(id: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(id));
    this.notify();
  }

  private notify(): void {
    this.changes.update((value) => value + 1);
    this.channel?.postMessage('changed');
  }

  async deleteAll(userId: string): Promise<void> {
    const uploads = await this.list(userId);
    for (const upload of uploads) {
      await this.delete(upload.id);
    }
  }

  private async run<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.database();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const fail = (error: unknown) =>
        settle(() =>
          reject(error instanceof Error ? error : new Error('Falha ao acessar dados offline')),
        );

      const transaction = database.transaction(OfflineUploadStoreService.storeName, mode);
      const request = operation(transaction.objectStore(OfflineUploadStoreService.storeName));

      if (mode === 'readonly') {
        request.onsuccess = () => settle(() => resolve(request.result));
      } else {
        transaction.oncomplete = () => settle(() => resolve(request.result));
      }

      request.onerror = () => fail(request.error ?? new Error('Falha ao acessar dados offline'));
      transaction.onerror = () =>
        fail(transaction.error ?? new Error('Falha ao acessar dados offline'));
      transaction.onabort = () =>
        fail(transaction.error ?? new Error('Falha ao acessar dados offline'));
    });
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(OfflineUploadStoreService.databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(OfflineUploadStoreService.storeName)) {
            const store = db.createObjectStore(OfflineUploadStoreService.storeName, {
              keyPath: 'id',
            });
            store.createIndex('userId', 'userId');
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.databasePromise = null;
          };
          db.onclose = () => {
            this.databasePromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          this.databasePromise = null;
          reject(request.error ?? new Error('Não foi possível abrir o armazenamento offline'));
        };
        request.onblocked = () => {
          this.databasePromise = null;
          reject(new Error('Armazenamento offline bloqueado por outra aba'));
        };
      });
    }
    return this.databasePromise;
  }
}
