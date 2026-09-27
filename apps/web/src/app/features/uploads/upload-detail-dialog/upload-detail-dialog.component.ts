import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';
import { UploadsService } from '../../../core/services/uploads.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { UploadDetail, UploadRecord } from '../../../shared/models/upload-record';
import {
  buildDisplayEntries,
  findOriginalFileForIndex,
  getSourceLabel,
  hasValidCoordinates,
  mapDisplayUrlsToResolvedMap,
  openMapCoordinates,
} from '../../../shared/utils/upload-utils';

/** Data injected via MAT_DIALOG_DATA. */
export interface UploadDetailDialogData {
  uploadId: string;
}

@Component({
  selector: 'app-upload-detail-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './upload-detail-dialog.component.html',
  styleUrl: './upload-detail-dialog.component.scss',
})
export class UploadDetailDialogComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly clipboard = inject(Clipboard);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<UploadDetailDialogComponent>);
  private readonly router = inject(Router);
  private readonly exportService = inject(ExportService);
  private readonly uploadsService = inject(UploadsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly dialogData = inject<UploadDetailDialogData>(MAT_DIALOG_DATA);

  readonly upload = signal<UploadDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly displayEntries = signal<string[]>([]);
  readonly selectedImageIndex = signal(0);
  readonly downloadingAll = signal(false);
  readonly downloadProgress = signal(0);
  readonly deleting = signal(false);

  /** Cached signed URLs for display entries, keyed by "variant:fileId". */
  readonly resolvedUrls = signal<Map<string, string>>(new Map());
  private readonly resolvingUrls = new Set<string>();

  readonly getSourceLabel = getSourceLabel;

  readonly canDelete = computed(() => {
    const user = this.authService.user();
    if (!user) return false;
    return this.authService.isAdmin() || this.upload()?.userId === user.id;
  });

  ngOnInit(): void {
    void this.loadDetail();
  }

  private async loadDetail(): Promise<void> {
    try {
      const data = await this.uploadsService.getUpload(this.dialogData.uploadId);
      this.upload.set(data);
      this.displayEntries.set(buildDisplayEntries(data.files));
      this.resolveDisplayEntriesBatch();
    } catch {
      this.error.set('Não foi possível carregar os detalhes do upload.');
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
      this.snackBar.open('Não foi possível obter as URLs de exibição.', 'Fechar', {
        duration: 6000,
      });
    }
  }

  selectImage(index: number): void {
    this.selectedImageIndex.set(index);
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
      const [type, id] = entry.split(':');
      let url: string;
      if (type === 'preview') {
        const resp = await this.uploadsService.getPreviewUrl(u.id, id);
        url = resp.downloadUrl;
      } else {
        const resp = await this.uploadsService.getDownloadUrl(u.id, id);
        url = resp.downloadUrl;
      }
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

  copyUploadId(): void {
    const u = this.upload();
    if (!u) return;
    this.clipboard.copy(u.id);
    this.snackBar.open('ID do upload copiado.', 'Fechar', { duration: 4000 });
  }

  copyUserId(): void {
    const u = this.upload();
    if (!u) return;
    this.clipboard.copy(u.userId);
    this.snackBar.open('ID do usuário copiado.', 'Fechar', { duration: 4000 });
  }

  copyFieldId(value: string | undefined | null, label: string): void {
    if (!value) return;
    this.clipboard.copy(value);
    this.snackBar.open(`${label} copiado.`, 'Fechar', { duration: 4000 });
  }

  /**
   * Open a URL via generated anchor click to avoid popup blockers.
   */
  downloadUrl(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /** Open the original image for the selected index. */
  async openOriginal(): Promise<void> {
    const entry = this.getOriginalEntryForSelected();
    if (!entry) return;
    const u = this.upload();
    if (!u) return;

    try {
      const fileId = entry.slice('original:'.length);
      const response = await this.uploadsService.getDownloadUrl(u.id, fileId);
      this.downloadUrl(response.downloadUrl);
    } catch {
      this.snackBar.open('Erro ao obter URL da imagem.', 'Fechar', { duration: 6000 });
    }
  }

  async downloadAllStructured(): Promise<void> {
    const u = this.upload();
    if (!u) return;

    const originals = u.files.filter((f) => f.variant === 'original');
    if (!originals.length) {
      this.snackBar.open('Este upload não possui imagens para baixar.', 'Fechar', {
        duration: 6000,
      });
      return;
    }

    this.downloadingAll.set(true);
    this.downloadProgress.set(0);

    try {
      const result = await this.exportService.downloadStructuredImagesZip(
        [this.toUploadRecord(u)],
        `upload-${u.id}-${Date.now()}`,
        (progress) => {
          this.downloadProgress.set(progress.percent);
        },
      );

      const downloadedLabel =
        result.downloaded === 1 ? 'imagem baixada' : 'imagens baixadas';
      const skippedLabel = result.skipped === 1 ? 'imagem ignorada' : 'imagens ignoradas';
      const message =
        result.skipped > 0
          ? `Download concluído: ${result.downloaded} ${downloadedLabel}, ${result.skipped} ${skippedLabel}.`
          : `Download concluído: ${result.downloaded} ${downloadedLabel}.`;
      this.snackBar.open(message, 'Fechar', { duration: 4000 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Não foi possível montar o arquivo de download${detail ? ` (${detail})` : ''}.`,
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.downloadingAll.set(false);
      this.downloadProgress.set(0);
    }
  }

  async deleteUpload(): Promise<void> {
    const u = this.upload();
    if (!u) return;

    const confirmRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Excluir Upload',
        message: `Tem certeza que deseja excluir o upload ${u.id}? Todas as imagens e anotações serão removidas permanentemente.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        confirmColor: 'warn',
      },
    });

    const confirmed = await firstValueFrom(confirmRef.afterClosed());
    if (!confirmed) return;

    this.deleting.set(true);

    try {
      await this.uploadsService.deleteUpload(u.id);
      this.snackBar.open('Upload excluído com sucesso.', 'Fechar', { duration: 4000 });
      this.dialogRef.close(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      this.snackBar.open(
        `Não foi possível excluir o upload${detail ? ` (${detail})` : ''}.`,
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.deleting.set(false);
    }
  }

  hasValidCoordinates(): boolean {
    return hasValidCoordinates(this.upload());
  }

  openInMap(): void {
    const u = this.upload();
    if (!u || !this.hasValidCoordinates()) {
      this.snackBar.open('Este upload não possui coordenadas válidas.', 'Fechar', {
        duration: 6000,
      });
      return;
    }
    openMapCoordinates(u.latitude, u.longitude);
  }

  goToLabeling(): void {
    const u = this.upload();
    if (!u) return;
    this.dialogRef.close();
    this.router.navigate(['/labeling'], { queryParams: { uploadId: u.id } });
  }

  /**
   * Convert UploadDetail to a minimal UploadRecord-compatible shape
   * for ExportService.downloadStructuredImagesZip.
   */
  private toUploadRecord(u: UploadDetail): UploadRecord {
    const originals = u.files.filter((f) => f.variant === 'original');
    return {
      id: u.id,
      userId: u.userId,
      user: u.user,
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
    };
  }
}
