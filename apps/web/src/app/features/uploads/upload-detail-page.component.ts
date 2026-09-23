import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../../core/services/auth.service';
import { ExportService } from '../../core/services/export.service';
import { UploadsService } from '../../core/services/uploads.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  buildDeleteUploadConfirmData,
  buildUploadZipName,
  resolveEntryUrl,
} from './upload-detail-shared';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { UploadDetail, UploadFileInfo } from '../../shared/models/upload-record';
import {
  buildDisplayEntries,
  findOriginalFileForIndex,
  formatFileSize,
  getSourceLabel,
  hasValidCoordinates,
  mapDisplayUrlsToResolvedMap,
  openMapCoordinates,
} from '../../shared/utils/upload-utils';

@Component({
  selector: 'app-upload-detail-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <section class="detail-page">
      <a routerLink="/uploads" class="back-link">&larr; Voltar para lista</a>

      @if (loading()) {
        <app-loading-state message="Carregando detalhes do upload..." />
      }

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (upload(); as u) {
        <app-page-header eyebrow="Detalhes" [title]="'Upload ' + u.id.slice(0, 8) + '…'">
          <span
            class="upload-id-full"
            (click)="copyUploadId(u.id)"
            title="Clique para copiar ID completo"
          >
            {{ u.id }}
            <mat-icon class="copy-inline-icon">content_copy</mat-icon>
          </span>
        </app-page-header>

        <div class="detail-layout">
          <!-- Info Panel -->
          <mat-card class="info-card">
            <div class="card-header">
              <mat-icon>info</mat-icon>
              <span>Informacoes</span>
            </div>
            <div class="card-body">
              <div class="info-row">
                <span class="info-label">Status</span>
                <span
                  class="status-badge"
                  [class.ready]="u.status === 'ready'"
                  [class.failed]="u.status === 'failed'"
                >
                  {{ u.status }}
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Origem</span>
                <span class="source-badge">{{ getSourceLabel(u.source) }}</span>
              </div>

              <div class="info-row">
                <span class="info-label">Usuario</span>
                <span
                  class="info-value clickable"
                  (click)="copyUserId(u.userId)"
                  title="Clique para copiar ID do usuario"
                >
                  {{ u.user?.fullName || u.userId }}
                  <mat-icon class="copy-icon">content_copy</mat-icon>
                </span>
              </div>

              @if (u.propertyName || u.propertyId) {
                <div class="info-row">
                  <span class="info-label">Propriedade</span>
                  <span
                    class="info-value clickable"
                    (click)="copyFieldId(u.propertyId, 'Propriedade')"
                    title="Clique para copiar ID"
                  >
                    {{ u.propertyName || u.propertyId }}
                    @if (u.propertyId) {
                      <mat-icon class="copy-icon">content_copy</mat-icon>
                    }
                  </span>
                </div>
              }

              <div class="info-row">
                <span class="info-label">Talhao</span>
                <span
                  class="info-value clickable"
                  (click)="copyFieldId(u.talhaoId, 'Talhao')"
                  title="Clique para copiar ID"
                >
                  {{ u.talhaoName || u.talhaoId }}
                  <mat-icon class="copy-icon">content_copy</mat-icon>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Cultura</span>
                <span
                  class="info-value clickable"
                  (click)="copyFieldId(u.cropTypeId, 'Cultura')"
                  title="Clique para copiar ID"
                >
                  {{ u.cropTypeName || u.cropTypeId }}
                  <mat-icon class="copy-icon">content_copy</mat-icon>
                </span>
              </div>

              @if (u.estadioId) {
                <div class="info-row">
                  <span class="info-label">Estadio</span>
                  <span
                    class="info-value clickable"
                    (click)="copyFieldId(u.estadioId!, 'Estadio')"
                    title="Clique para copiar ID"
                  >
                    {{ u.estadioName || u.estadioId }}
                    <mat-icon class="copy-icon">content_copy</mat-icon>
                  </span>
                </div>
              }

              <div class="info-row gps-row">
                <span class="info-label">GPS</span>
                <span class="gps-coords">{{ u.latitude }}, {{ u.longitude }}</span>
                <button
                  mat-stroked-button
                  class="map-button"
                  [disabled]="!hasValidCoordinates(u)"
                  (click)="openInMap(u)"
                >
                  <mat-icon>map</mat-icon>
                  Ver no mapa
                </button>
              </div>

              <div class="info-row">
                <span class="info-label">Data de atividade</span>
                <span class="activity-date">{{ u.activityDate | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>

              @if (u.errorMessage) {
                <div class="info-row">
                  <span class="info-label">Erro</span>
                  <span class="error-text">{{ u.errorMessage }}</span>
                </div>
              }
            </div>
          </mat-card>

          <!-- Image Panel -->
          <mat-card class="image-card">
            <div class="card-header">
              <mat-icon>photo_library</mat-icon>
              <span>Imagens</span>
              <span class="count-badge">{{ u.files.length }}</span>
            </div>
            <div class="card-body">
              @if (displayEntries().length > 0) {
                <div class="hero-wrap">
                  @if (getSelectedDisplayImage(); as imgUrl) {
                    <img [src]="imgUrl" alt="Imagem do upload" class="hero-image" />
                  } @else {
                    <div class="hero-loading">
                      <mat-icon>hourglass_empty</mat-icon>
                      <span>Carregando imagem...</span>
                    </div>
                  }
                </div>

                <div class="hero-actions">
                  <button mat-flat-button color="primary" (click)="openOriginal()">
                    <mat-icon>open_in_new</mat-icon>
                    Abrir original
                  </button>

                  <button
                    mat-flat-button
                    color="primary"
                    (click)="downloadAllStructured(u)"
                    [disabled]="downloadingAll()"
                  >
                    <mat-icon>download</mat-icon>
                    @if (downloadingAll()) {
                      Preparando ZIP...
                    } @else {
                      Baixar Todas
                    }
                  </button>
                </div>

                @if (downloadingAll()) {
                  <div class="download-progress-wrap">
                    <div class="download-progress-header">
                      <mat-icon class="download-icon">cloud_download</mat-icon>
                      <span>Baixando imagens...</span>
                      <span class="download-percent">{{ downloadProgress() }}%</span>
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="downloadProgress()"
                    ></mat-progress-bar>
                    <p class="download-warning">Nao feche a pagina ate concluir o download.</p>
                  </div>
                }

                <div class="thumb-strip">
                  @for (entry of displayEntries(); track $index) {
                    <button
                      type="button"
                      class="thumb-button"
                      [class.selected]="$index === selectedImageIndex()"
                      [attr.aria-current]="$index === selectedImageIndex() ? 'true' : null"
                      [attr.aria-label]="'Selecionar miniatura da imagem ' + ($index + 1)"
                      (click)="selectImage($index)"
                    >
                      @if (resolvedUrls().get(entry); as thumbUrl) {
                        <img [src]="thumbUrl" alt="" />
                      } @else {
                        <div class="thumb-placeholder">
                          <mat-icon>image</mat-icon>
                        </div>
                      }
                    </button>
                  }
                </div>
              } @else {
                <div class="no-images">
                  <mat-icon>image_not_supported</mat-icon>
                  <p>Nenhuma imagem disponivel.</p>
                </div>
              }
            </div>
          </mat-card>
        </div>

        <!-- Files table (collapsed by default) -->
        <mat-card class="files-card">
          <button
            type="button"
            class="card-header card-header-toggle"
            [attr.aria-expanded]="showFilesTable()"
            (click)="showFilesTable.set(!showFilesTable())"
          >
            <mat-icon>folder</mat-icon>
            <span>Arquivos ({{ u.files.length }})</span>
            <mat-icon class="expand-icon" [class.expanded]="showFilesTable()">expand_more</mat-icon>
          </button>
          @if (showFilesTable()) {
            <div class="card-body">
              <table class="files-table">
                <thead>
                  <tr>
                    <th>Indice</th>
                    <th>Tipo</th>
                    <th>Variacao</th>
                    <th>Tamanho</th>
                    <th>Dimensoes</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of u.files; track f.id) {
                    <tr>
                      <td>{{ f.imageIndex }}</td>
                      <td>{{ f.contentType }}</td>
                      <td>{{ f.variant }}</td>
                      <td>{{ formatSize(f.sizeBytes) }}</td>
                      <td>{{ f.width && f.height ? f.width + '×' + f.height : '—' }}</td>
                      <td>
                        <button
                          mat-stroked-button
                          class="btn-file-download"
                          [disabled]="downloadingFileId() === f.id"
                          (click)="downloadFile(u.id, f)"
                        >
                          {{
                            downloadingFileId() === f.id
                              ? 'Abrindo...'
                              : f.variant === 'preview'
                                ? 'Preview'
                                : 'Original'
                          }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </mat-card>

        <!-- Actions bar -->
        <div class="actions-bar">
          @if (canDelete()) {
            <button
              mat-flat-button
              class="delete-btn"
              (click)="deleteUpload(u)"
              [disabled]="deleting()"
            >
              <mat-icon>delete</mat-icon>
              @if (deleting()) {
                Excluindo...
              } @else {
                Excluir
              }
            </button>
          }
          <div class="right-actions">
            <button
              mat-flat-button
              color="primary"
              [routerLink]="['/labeling']"
              [queryParams]="{ uploadId: u.id }"
            >
              <mat-icon>crop_free</mat-icon>
              Anotar
            </button>
            <button
              mat-flat-button
              color="accent"
              [routerLink]="['/inference']"
              [queryParams]="{ uploadId: u.id }"
            >
              <mat-icon>psychology</mat-icon>
              Executar inferência
            </button>
            <a mat-stroked-button routerLink="/uploads">Fechar</a>
          </div>
        </div>
      }
    </section>
  `,
  styleUrl: './upload-detail-page.component.scss',
})
export class UploadDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly clipboard = inject(Clipboard);
  private readonly dialog = inject(MatDialog);
  private readonly uploadsService = inject(UploadsService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);

  readonly upload = signal<UploadDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deleting = signal(false);
  readonly downloadingAll = signal(false);
  readonly downloadProgress = signal(0);
  readonly downloadingFileId = signal<string | null>(null);
  readonly selectedImageIndex = signal(0);
  readonly showFilesTable = signal(false);

  /** Cached signed URLs for image entries. */
  readonly resolvedUrls = signal<Map<string, string>>(new Map());
  private readonly resolvingUrls = new Set<string>();

  /** Display entries: each is "preview:<fileId>" or "original:<fileId>" */
  readonly displayEntries = signal<string[]>([]);

  readonly getSourceLabel = getSourceLabel;

  readonly canDelete = computed(() => {
    const user = this.authService.user();
    if (!user) return false;
    return this.authService.isAdmin() || this.upload()?.userId === user.id;
  });

  ngOnInit(): void {
    const uploadId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!uploadId) {
      this.error.set('ID do upload nao informado.');
      this.loading.set(false);
      return;
    }
    void this.loadDetail(uploadId);
  }

  private async loadDetail(uploadId: string): Promise<void> {
    try {
      const data = await this.uploadsService.getUpload(uploadId);
      this.upload.set(data);
      this.displayEntries.set(buildDisplayEntries(data.files));
      this.resolveDisplayEntriesBatch();
    } catch {
      this.error.set('Nao foi possivel carregar os detalhes do upload.');
    } finally {
      this.loading.set(false);
    }
  }

  private async resolveDisplayEntriesBatch(): Promise<void> {
    const u = this.upload();
    if (!u) return;
    try {
      const response = await this.uploadsService.getDisplayUrls(u.id);
      this.resolvedUrls.set(mapDisplayUrlsToResolvedMap(response.files, this.resolvedUrls()));
    } catch {
      this.snackBar.open('Nao foi possivel obter as URLs de exibicao.', 'Fechar', {
        duration: 6000,
      });
    }
  }

  selectImage(index: number): void {
    this.selectedImageIndex.set(index);
    // Ensure URL is resolved for the selected image
    const entries = this.displayEntries();
    if (entries[index]) {
      void this.ensureUrlResolved(entries[index]);
    }
  }

  getSelectedDisplayImage(): string {
    const entries = this.displayEntries();
    const entry = entries[this.selectedImageIndex()];
    if (!entry) return '';
    return this.resolvedUrls().get(entry) ?? '';
  }

  getOriginalEntryForSelected(): string {
    const u = this.upload();
    if (!u) return '';
    const original = findOriginalFileForIndex(u.files, this.selectedImageIndex());
    return original ? `original:${original.id}` : '';
  }

  /** Resolve display image references to actual signed URLs. */
  async ensureUrlResolved(entry: string): Promise<void> {
    if (this.resolvedUrls().has(entry) || this.resolvingUrls.has(entry)) return;
    this.resolvingUrls.add(entry);
    try {
      const u = this.upload();
      if (!u) return;
      const url = await resolveEntryUrl(this.uploadsService, u.id, entry);
      this.resolvedUrls.update((map) => {
        const next = new Map(map);
        next.set(entry, url);
        return next;
      });
    } catch {
      // Silently ignore
    } finally {
      this.resolvingUrls.delete(entry);
    }
  }

  formatSize(bytes: number | null): string {
    return formatFileSize(bytes);
  }

  copyUploadId(id: string): void {
    this.clipboard.copy(id);
    this.snackBar.open('Upload ID copiado.', 'Fechar', { duration: 4000 });
  }

  copyUserId(userId: string): void {
    this.clipboard.copy(userId);
    this.snackBar.open('ID do usuario copiado.', 'Fechar', { duration: 4000 });
  }

  copyFieldId(value: string | undefined | null, label: string): void {
    if (!value) return;
    this.clipboard.copy(value);
    this.snackBar.open(`${label} copiado.`, 'Fechar', { duration: 4000 });
  }

  hasValidCoordinates(u: UploadDetail): boolean {
    return hasValidCoordinates(u);
  }

  openInMap(u: UploadDetail): void {
    if (!this.hasValidCoordinates(u)) {
      this.snackBar.open('Este upload nao possui coordenadas validas.', 'Fechar', {
        duration: 6000,
      });
      return;
    }
    openMapCoordinates(u.latitude, u.longitude);
  }

  async openOriginal(): Promise<void> {
    const entry = this.getOriginalEntryForSelected();
    if (!entry) return;
    const u = this.upload();
    if (!u) return;

    try {
      const fileId = entry.slice('original:'.length);
      const response = await this.uploadsService.getDownloadUrl(u.id, fileId);
      window.open(response.downloadUrl, '_blank', 'noopener');
    } catch {
      this.snackBar.open('Erro ao obter URL da imagem.', 'Fechar', { duration: 6000 });
    }
  }

  async downloadFile(uploadId: string, file: UploadFileInfo): Promise<void> {
    this.downloadingFileId.set(file.id);
    try {
      let url: string;
      if (file.variant === 'preview') {
        const resp = await this.uploadsService.getPreviewUrl(uploadId, file.id);
        url = resp.downloadUrl;
      } else {
        const resp = await this.uploadsService.getDownloadUrl(uploadId, file.id);
        url = resp.downloadUrl;
      }
      window.open(url, '_blank', 'noopener');
    } catch {
      this.snackBar.open('Erro ao obter URL de download.', 'Fechar', { duration: 6000 });
    } finally {
      this.downloadingFileId.set(null);
    }
  }

  async downloadAllStructured(u: UploadDetail): Promise<void> {
    const originals = u.files.filter((f) => f.variant === 'original');
    if (!originals.length) {
      this.snackBar.open('Este upload nao possui imagens para baixar.', 'Fechar', {
        duration: 6000,
      });
      return;
    }

    this.downloadingAll.set(true);
    this.downloadProgress.set(0);

    try {
      const result = await this.exportService.downloadStructuredImagesZip(
        [
          {
            id: u.id,
            userId: u.userId,
            propertyId: u.propertyId,
            propertyName: u.propertyName,
            talhaoId: u.talhaoId,
            talhaoName: u.talhaoName,
            cropTypeId: u.cropTypeId,
            cropTypeName: u.cropTypeName,
            estadioId: u.estadioId,
            estadioName: u.estadioName,
            source: u.source,
            status: u.status,
            activityDate: u.activityDate,
            latitude: u.latitude,
            longitude: u.longitude,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
            fileCount: originals.length,
          },
        ],
        buildUploadZipName(u.id),
        (progress) => {
          this.downloadProgress.set(progress.percent);
        },
      );

      const message =
        result.skipped > 0
          ? `Download concluido: ${result.downloaded} imagens baixadas, ${result.skipped} ignoradas.`
          : `Download concluido: ${result.downloaded} imagens baixadas.`;
      this.snackBar.open(message, 'Fechar', { duration: 4000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Nao foi possivel montar o arquivo de download${detail ? ` (${detail})` : ''}.`,
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.downloadingAll.set(false);
      this.downloadProgress.set(0);
    }
  }

  async deleteUpload(u: UploadDetail): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: buildDeleteUploadConfirmData(u.id),
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    this.deleting.set(true);

    try {
      await this.uploadsService.deleteUpload(u.id);
      this.snackBar.open('Upload excluido com sucesso.', 'Fechar', { duration: 4000 });
      await this.router.navigate(['/uploads']);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Nao foi possivel excluir o upload${detail ? ` (${detail})` : ''}.`,
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.deleting.set(false);
    }
  }
}
