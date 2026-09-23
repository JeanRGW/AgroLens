import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { OfflineCatalogCacheService } from '../../core/services/offline-catalog-cache.service';
import { OfflineUpload } from '../../shared/models/offline-upload';
import { formatFileSize, getSourceLabel } from '../../shared/utils/upload-utils';

export interface OfflineUploadDetailDialogData {
  upload: OfflineUpload;
}

@Component({
  selector: 'app-offline-upload-detail-dialog',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Detalhes do lote</h2>
    <mat-dialog-content>
      <div class="status-row">
        <span class="status" [class]="upload.status">{{ statusLabel(upload.status) }}</span>
        <span>{{ upload.files.length }} imagem(ns)</span>
      </div>

      @if (upload.errorMessage) {
        <div class="error"><mat-icon>error_outline</mat-icon>{{ upload.errorMessage }}</div>
      }

      <section class="detail-section">
        <h3>Metadados da coleta</h3>
        <dl class="metadata-grid">
          <div>
            <dt>Propriedade</dt>
            <dd>{{ propertyName() }}</dd>
          </div>
          <div>
            <dt>Talhão</dt>
            <dd>{{ talhaoName() }}</dd>
          </div>
          <div>
            <dt>Cultura</dt>
            <dd>{{ cropTypeName() }}</dd>
          </div>
          @if (upload.request.estadioId) {
            <div>
              <dt>Estádio</dt>
              <dd>{{ estadioName() }}</dd>
            </div>
          }
          <div>
            <dt>Fonte</dt>
            <dd>{{ getSourceLabel(upload.request.source) }}</dd>
          </div>
          <div>
            <dt>Data da coleta</dt>
            <dd>{{ upload.request.activityDate | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </div>
          <div>
            <dt>Latitude</dt>
            <dd>{{ upload.request.latitude | number: '1.5-6' }}</dd>
          </div>
          <div>
            <dt>Longitude</dt>
            <dd>{{ upload.request.longitude | number: '1.5-6' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>Imagens locais</h3>
        <div class="image-viewer">
          <img [src]="imageUrls[selectedImageIndex()]" [alt]="selectedFile().fileName" />
          <p>
            {{ selectedFile().fileName }} · {{ selectedFile().contentType }} ·
            {{ formatSize(selectedFile().blob.size) }}
          </p>
        </div>
        <div class="thumbnail-list" role="group" aria-label="Selecionar imagem">
          @for (file of upload.files; track file.fileName; let index = $index) {
            <button
              type="button"
              [class.selected]="selectedImageIndex() === index"
              [attr.aria-label]="'Visualizar ' + file.fileName"
              (click)="selectedImageIndex.set(index)"
            >
              <img [src]="imageUrls[index]" [alt]="'Miniatura de ' + file.fileName" />
            </button>
          }
        </div>
      </section>

      <section class="detail-section identifiers">
        <h3>Sincronização</h3>
        <dl>
          <div>
            <dt>Salvo no dispositivo</dt>
            <dd>{{ upload.createdAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </div>
          <div>
            <dt>ID local</dt>
            <dd>{{ upload.id }}</dd>
          </div>
          @if (upload.backendUploadId) {
            <div>
              <dt>ID no servidor</dt>
              <dd>{{ upload.backendUploadId }}</dd>
            </div>
          }
        </dl>
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      min-width: min(760px, 85vw);
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--agri-text-secondary);
      font-size: 0.9rem;
    }
    .status {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .pending,
    .syncing {
      color: #7a5b00;
    }
    .failed {
      color: #b3261e;
    }
    .completed {
      color: #176b32;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: #fdecea;
      color: #b3261e;
    }
    .detail-section h3 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: var(--agri-text);
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem 1rem;
      margin: 0;
    }
    dl div {
      min-width: 0;
    }
    dt {
      color: var(--agri-text-secondary);
      font-size: 0.75rem;
    }
    dd {
      margin: 0.2rem 0 0;
      overflow-wrap: anywhere;
      color: var(--agri-text);
      font-weight: 600;
    }
    .image-viewer {
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--agri-fill-subtle);
    }
    .image-viewer img {
      display: block;
      width: 100%;
      max-height: 420px;
      object-fit: contain;
    }
    .image-viewer p {
      margin: 0;
      padding: 0.6rem 0.75rem;
      color: var(--agri-text-secondary);
      font-size: 0.82rem;
      overflow-wrap: anywhere;
    }
    .thumbnail-list {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }
    .thumbnail-list button {
      flex: 0 0 72px;
      width: 72px;
      height: 72px;
      padding: 0;
      overflow: hidden;
      border: 2px solid transparent;
      border-radius: 8px;
      background: var(--agri-fill-subtle);
      cursor: pointer;
    }
    .thumbnail-list button.selected {
      border-color: var(--agri-accent);
    }
    .thumbnail-list img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .identifiers {
      border-top: 1px solid var(--agri-border);
      padding-top: 1rem;
    }
    .identifiers dl {
      display: grid;
      gap: 0.6rem;
      margin: 0;
    }
    @media (max-width: 600px) {
      mat-dialog-content {
        min-width: 0;
      }
      .metadata-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class OfflineUploadDetailDialogComponent {
  private readonly catalogCache = inject(OfflineCatalogCacheService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogData = inject<OfflineUploadDetailDialogData>(MAT_DIALOG_DATA);
  readonly upload = this.dialogData.upload;
  readonly imageUrls = this.upload.files.map((file) => URL.createObjectURL(file.blob));
  readonly selectedImageIndex = signal(0);
  readonly selectedFile = computed(() => this.upload.files[this.selectedImageIndex()]);
  private readonly catalogs = this.catalogCache.load();

  constructor() {
    this.destroyRef.onDestroy(() => this.imageUrls.forEach((url) => URL.revokeObjectURL(url)));
  }

  propertyName(): string {
    return (
      this.catalogs?.properties.find((item) => item.id === this.upload.request.propertyId)?.name ??
      this.upload.request.propertyId
    );
  }

  talhaoName(): string {
    return (
      this.catalogs?.talhoes.find((item) => item.id === this.upload.request.talhaoId)?.name ??
      this.upload.request.talhaoId
    );
  }

  cropTypeName(): string {
    return (
      this.catalogs?.cropTypes.find((item) => item.id === this.upload.request.cropTypeId)?.name ??
      this.upload.request.cropTypeId
    );
  }

  estadioName(): string {
    return (
      this.catalogs?.estadios.find((item) => item.id === this.upload.request.estadioId)?.name ??
      this.upload.request.estadioId ??
      ''
    );
  }

  readonly getSourceLabel = getSourceLabel;
  readonly formatSize = formatFileSize;

  statusLabel(status: OfflineUpload['status']): string {
    return {
      pending: 'Pendente',
      syncing: 'Sincronizando',
      failed: 'Falhou',
      completed: 'Concluído',
    }[status];
  }
}
