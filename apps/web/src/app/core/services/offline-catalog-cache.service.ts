import { inject, Injectable, signal } from '@angular/core';

import { CropTypeRecord, EstadioRecord, PropertyRecord, TalhaoRecord } from '@agrolens/contracts';
import { AuthService } from './auth.service';
import { CatalogsService } from './catalogs.service';

export interface OfflineCatalogs {
  properties: PropertyRecord[];
  talhoes: TalhaoRecord[];
  cropTypes: CropTypeRecord[];
  estadios: EstadioRecord[];
}

interface CatalogSnapshot extends OfflineCatalogs {
  savedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineCatalogCacheService {
  private readonly authService = inject(AuthService);
  private readonly catalogsService = inject(CatalogsService);
  readonly savedAt = signal<string | null>(null);
  readonly available = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal('');
  private inflight: { userId: string; promise: Promise<OfflineCatalogs> } | null = null;

  save(catalogs: OfflineCatalogs, userId = this.authService.user()?.id): void {
    if (!userId) return;
    if (userId !== this.authService.user()?.id)
      throw new Error('A conta mudou durante a preparação dos catálogos.');
    if (!validCatalogs(catalogs)) throw new Error('Os catálogos recebidos estão incompletos.');
    const savedAt = new Date().toISOString();
    localStorage.setItem(this.key(userId), JSON.stringify({ ...catalogs, savedAt }));
    this.savedAt.set(savedAt);
    this.available.set(true);
    this.error.set('');
  }

  load(): OfflineCatalogs | null {
    const userId = this.authService.user()?.id;
    this.savedAt.set(null);
    this.available.set(false);
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(this.key(userId));
      if (!raw) return null;
      const cached: unknown = JSON.parse(raw);
      if (!validCatalogs(cached)) return null;
      this.savedAt.set(typeof cached.savedAt === 'string' ? cached.savedAt : null);
      this.available.set(true);
      const { properties, talhoes, cropTypes, estadios } = cached;
      return { properties, talhoes, cropTypes, estadios };
    } catch {
      return null;
    }
  }

  async refresh(): Promise<OfflineCatalogs> {
    const userId = this.authService.user()?.id;
    if (!userId || !navigator.onLine || this.authService.offlineSession()) {
      const cached = this.load();
      if (cached) return cached;
      throw new Error(
        'Conecte-se e prepare os catálogos nesta instalação antes de coletar offline.',
      );
    }
    if (this.inflight?.userId === userId) return this.inflight.promise;
    this.refreshing.set(true);
    const promise = this.fetchCatalogs(userId);
    this.inflight = { userId, promise };
    try {
      return await promise;
    } finally {
      if (this.inflight?.promise === promise) {
        this.inflight = null;
        this.refreshing.set(false);
      }
    }
  }

  private async fetchCatalogs(userId: string): Promise<OfflineCatalogs> {
    try {
      const [properties, talhoes, cropTypes, estadios] = await Promise.all([
        this.catalogsService.listProperties(),
        this.catalogsService.listTalhoes(),
        this.catalogsService.listCropTypes(),
        this.catalogsService.listEstadios(),
      ]);
      this.authService.assertIdentity(userId);
      const catalogs = { properties, talhoes, cropTypes, estadios };
      this.save(catalogs, userId);
      return catalogs;
    } catch (error) {
      if (this.authService.user()?.id === userId) {
        this.error.set(
          'Não foi possível atualizar os catálogos. A última cópia salva continua disponível.',
        );
      }
      throw error;
    }
  }

  clear(userId = this.authService.user()?.id): void {
    if (!userId) return;
    localStorage.removeItem(this.key(userId));
    if (userId === this.authService.user()?.id) {
      this.savedAt.set(null);
      this.available.set(false);
    }
  }

  private key(userId: string): string {
    return `agrolens:offline-catalogs:${userId}`;
  }
}

function validCatalogs(value: unknown): value is CatalogSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['properties', 'talhoes', 'cropTypes', 'estadios'].every((key) => {
    const items = record[key];
    return (
      Array.isArray(items) &&
      items.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const entry = item as Record<string, unknown>;
        return (
          typeof entry['id'] === 'string' &&
          typeof entry['name'] === 'string' &&
          (key !== 'talhoes' || typeof entry['propertyId'] === 'string') &&
          (key !== 'estadios' || typeof entry['cropTypeId'] === 'string')
        );
      })
    );
  });
}
