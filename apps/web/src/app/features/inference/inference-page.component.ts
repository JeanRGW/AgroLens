import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { validateUploadImages } from '../../shared/utils/upload-validation';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { InferenceService } from '../../core/services/inference.service';
import { UploadsService } from '../../core/services/uploads.service';
import { PresignedUploadService } from '../../core/services/presigned-upload.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InferenceJobListItem, InferenceModelSummary } from '@agrolens/contracts';
import { UploadRecord } from '../../shared/models/upload-record';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog.component';

const STATUS_BADGE: Record<string, string> = {
  queued: 'badge-blue',
  uploading: 'badge-blue',
  running: 'badge-amber',
  completed: 'badge-green',
  failed: 'badge-red',
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  uploading: 'Enviando',
  running: 'Executando',
  completed: 'Concluído',
  failed: 'Falhou',
};

const DELETEABLE_STATUSES = new Set(['uploading', 'completed', 'failed']);

@Component({
  selector: 'app-inference-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
    PageHeaderComponent,
  ],
  templateUrl: './inference-page.component.html',
  styleUrl: './inference-page.component.scss',
})
export class InferencePageComponent implements OnInit {
  private readonly inferenceService = inject(InferenceService);
  private readonly uploadsService = inject(UploadsService);
  private readonly presignedUploadService = inject(PresignedUploadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly Math = Math;

  // Models
  readonly models = signal<InferenceModelSummary[]>([]);
  readonly loadingModels = signal(true);
  readonly modelsError = signal('');
  readonly selectedModel = computed(() =>
    this.models().find((model) => model.id === this.selectedModelId()),
  );

  // Uploads
  readonly uploads = signal<UploadRecord[]>([]);
  readonly loadingUploads = signal(false);
  readonly uploadsError = signal('');
  readonly uploadCoverUrl = signal('');
  readonly loadingUploadCover = signal(false);
  readonly selectedUpload = computed(() =>
    this.uploads().find((upload) => upload.id === this.selectedUploadId()),
  );

  // Form
  readonly selectedModelId = signal('');
  readonly sourceType = signal<'upload' | 'temp'>('temp');
  readonly selectedUploadId = signal('');
  readonly tempFiles = signal<File[]>([]);
  readonly previewUrls = signal<Map<File, string>>(new Map());
  readonly dragActive = signal(false);
  readonly selectedTab = signal(0);
  readonly selectedImageCount = computed(() => {
    if (this.sourceType() === 'temp') return this.tempFiles().length;
    if (this.selectedUploadId() === this.queryUploadId && this.queryImageId) return 1;
    return this.selectedUpload()?.fileCount ?? 0;
  });
  readonly totalFileSize = computed(() =>
    this.tempFiles().reduce((size, file) => size + file.size, 0),
  );
  readonly submissionHint = computed(() => {
    if (!this.selectedModelId()) return 'Selecione um modelo para continuar.';
    if (!this.selectedImageCount())
      return this.sourceType() === 'temp'
        ? 'Adicione imagens para continuar.'
        : 'Selecione um upload com imagens para continuar.';
    return this.sourceType() === 'temp'
      ? 'As imagens serão enviadas somente ao executar.'
      : 'As imagens do upload serão usadas sem um novo envio.';
  });

  // Form state
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly selectionError = signal('');
  readonly submissionStage = signal('');

  // Jobs
  readonly jobs = signal<InferenceJobListItem[]>([]);
  readonly jobsTotal = signal(0);
  readonly jobsOffset = signal(0);
  readonly loadingJobs = signal(false);
  readonly jobsError = signal('');
  readonly pageSize = 20;

  // Polling
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private queryUploadId: string | null = null;
  private queryImageId: string | undefined;
  private jobsRequest = 0;
  private coverRequest = 0;

  readonly jobColumns = ['model', 'status', 'progress', 'createdAt', 'actions'];

  readonly statusBadgeClass = (status: string) => STATUS_BADGE[status] || '';
  readonly statusLabel = (status: string) => STATUS_LABEL[status] || status;

  readonly canSubmit = computed(() => {
    if (!this.selectedModelId()) return false;
    if (this.sourceType() === 'upload')
      return !!this.selectedUploadId() && this.selectedImageCount() > 0;
    return this.tempFiles().length > 0;
  });

  constructor() {
    effect(() => {
      const upload = this.sourceType() === 'upload' ? this.selectedUpload() : undefined;
      void this.loadUploadCover(upload);
    });
    this.destroyRef.onDestroy(() => {
      if (this.pollTimer !== null) {
        clearTimeout(this.pollTimer);
      }
      for (const url of this.previewUrls().values()) URL.revokeObjectURL(url);
    });
  }

  async ngOnInit(): Promise<void> {
    this.queryUploadId = this.route.snapshot.queryParamMap.get('uploadId');
    this.queryImageId = this.route.snapshot.queryParamMap.get('imageId') ?? undefined;
    this.selectedTab.set(this.route.snapshot.queryParamMap.get('tab') === 'history' ? 1 : 0);
    if (this.queryUploadId) this.sourceType.set('upload');

    await Promise.all([this.loadModels(), this.loadUploads(), this.loadJobs()]);

    if (this.queryUploadId && this.uploads().some((upload) => upload.id === this.queryUploadId)) {
      this.selectedUploadId.set(this.queryUploadId);
    }
  }

  onTempFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    input.value = '';
    this.addTempFiles(files);
  }

  addTempFiles(files: File[]): void {
    if (this.submitting() || !files.length) return;
    this.selectionError.set('');
    const current = this.tempFiles();
    const keys = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const newFiles = files.filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    if (!newFiles.length) return;

    let types: string[];
    try {
      types = validateUploadImages(newFiles);
    } catch (err: unknown) {
      this.rejectSelection(
        err instanceof Error ? err.message : 'Selecione imagens JPEG, PNG ou WebP não vazias.',
      );
      return;
    }

    const total = current.length + newFiles.length;

    if (total > 20) {
      this.rejectSelection('Máximo de 20 arquivos permitidos.');
      return;
    }

    for (const f of newFiles) {
      if (f.size > 25 * 1024 * 1024) {
        this.rejectSelection(`Arquivo "${f.name}" excede 25 MB.`);
        return;
      }
    }

    this.previewUrls.update((urls) => {
      const next = new Map(urls);
      newFiles.forEach((file, index) =>
        next.set(file, URL.createObjectURL(file.slice(0, file.size, types[index]))),
      );
      return next;
    });
    this.tempFiles.set([...current, ...newFiles]);
  }

  removeTempFile(index: number): void {
    if (this.submitting()) return;
    const file = this.tempFiles()[index];
    const url = this.previewUrls().get(file);
    if (url) URL.revokeObjectURL(url);
    this.previewUrls.update((urls) => {
      const next = new Map(urls);
      next.delete(file);
      return next;
    });
    this.tempFiles.update((files) => files.filter((_, i) => i !== index));
    this.selectionError.set('');
  }

  clearTempFiles(): void {
    if (this.submitting()) return;
    for (const url of this.previewUrls().values()) URL.revokeObjectURL(url);
    this.previewUrls.set(new Map());
    this.tempFiles.set([]);
    this.selectionError.set('');
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.submitting()) this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addTempFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  changeSource(source: 'upload' | 'temp'): void {
    if (this.submitting()) return;
    this.sourceType.set(source);
    this.error.set('');
    this.selectionError.set('');
  }

  onTabChange(index: number): void {
    this.selectedTab.set(index);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index === 1 ? 'history' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  retryModels(): void {
    void this.loadModels();
  }
  retryUploads(): void {
    void this.loadUploads();
  }
  refreshJobs(): void {
    void this.loadJobs();
  }

  private async loadUploadCover(upload: UploadRecord | undefined): Promise<void> {
    const request = ++this.coverRequest;
    this.uploadCoverUrl.set('');
    this.loadingUploadCover.set(!!upload);
    if (!upload) return;

    try {
      let url: string;
      if (upload.previewFileId) {
        const preview = await this.uploadsService.getPreviewUrl(upload.id, upload.previewFileId);
        url = preview.downloadUrl;
      } else {
        // Linked uploads fetched directly may not carry a cover file ID.
        const response = await this.uploadsService.getDisplayUrls(upload.id);
        const files = Object.values(response.files);
        url = (files.find((file) => file.variant === 'preview') ?? files[0])?.url ?? '';
      }
      if (request !== this.coverRequest || this.destroyRef.destroyed) return;
      this.uploadCoverUrl.set(url);
      if (!url) this.loadingUploadCover.set(false);
    } catch {
      if (request !== this.coverRequest || this.destroyRef.destroyed) return;
      this.loadingUploadCover.set(false);
    }
  }

  onUploadCoverLoad(url: string): void {
    if (url === this.uploadCoverUrl()) this.loadingUploadCover.set(false);
  }

  onUploadCoverError(url: string): void {
    if (url !== this.uploadCoverUrl()) return;
    this.uploadCoverUrl.set('');
    this.loadingUploadCover.set(false);
  }

  private rejectSelection(message: string): void {
    this.selectionError.set(message);
    this.snackBar.open(message, 'Fechar', { duration: 6000 });
  }

  async submitInference(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) return;

    this.submitting.set(true);
    this.error.set('');
    this.submissionStage.set('Preparando execução…');

    try {
      if (this.sourceType() === 'upload') {
        await this.submitUploadJob();
      } else {
        await this.submitTempJob();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar execução de inferência.';
      this.error.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      this.submitting.set(false);
      this.submissionStage.set('');
    }
  }

  async openJob(jobId: string): Promise<void> {
    await this.router.navigate(['/inference', jobId]);
  }

  canDeleteJob(row: InferenceJobListItem): boolean {
    return DELETEABLE_STATUSES.has(row.status);
  }

  async confirmDeleteJob(row: InferenceJobListItem): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Excluir execução',
        message: `Deseja realmente excluir a execução "${row.id}"?`,
        confirmText: 'Excluir',
      } as ConfirmDialogData,
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await this.inferenceService.deleteJob(row.id);
        this.snackBar.open('Execução excluída com sucesso.', 'Fechar', { duration: 4000 });
        await this.loadJobs();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao excluir a execução.';
        this.snackBar.open(msg, 'Fechar', { duration: 6000 });
      }
    }
  }

  nextJobsPage(): void {
    if (this.loadingJobs() || this.jobsOffset() + this.pageSize >= this.jobsTotal()) return;
    this.jobsOffset.update((o) => o + this.pageSize);
    void this.loadJobs();
  }

  prevJobsPage(): void {
    if (this.loadingJobs() || this.jobsOffset() <= 0) return;
    this.jobsOffset.update((o) => Math.max(0, o - this.pageSize));
    void this.loadJobs();
  }

  // ─── Private ────────────────────────────────────────────────

  private async loadModels(): Promise<void> {
    this.loadingModels.set(true);
    this.modelsError.set('');
    try {
      const models = await this.inferenceService.listActiveModels();
      if (this.destroyRef.destroyed) return;
      this.models.set(models);
      if (models.length === 1 && !this.selectedModelId()) this.selectedModelId.set(models[0].id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar modelos';
      this.modelsError.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      this.loadingModels.set(false);
    }
  }

  private async loadUploads(): Promise<void> {
    this.loadingUploads.set(true);
    this.uploadsError.set('');
    try {
      const result = await this.uploadsService.listUploads(undefined, 50, 0);
      if (this.destroyRef.destroyed) return;
      this.uploads.set(result.records.filter((upload) => upload.status === 'ready'));
      if (
        this.queryUploadId &&
        !result.records.some((upload) => upload.id === this.queryUploadId)
      ) {
        let upload;
        try {
          upload = await this.uploadsService.getUpload(this.queryUploadId);
        } catch {
          this.snackBar.open('O upload indicado não está disponível.', 'Fechar', {
            duration: 6000,
          });
          return;
        }
        if (upload.status === 'ready')
          this.uploads.update((uploads) => [
            {
              ...upload,
              fileCount: upload.files.filter((file) => file.variant === 'original').length,
            },
            ...uploads,
          ]);
        else
          this.snackBar.open('O upload indicado ainda não está pronto para inferência.', 'Fechar', {
            duration: 6000,
          });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar uploads';
      this.uploadsError.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      this.loadingUploads.set(false);
    }
  }

  private async loadJobs(): Promise<void> {
    if (this.destroyRef.destroyed) return;
    const request = ++this.jobsRequest;
    this.loadingJobs.set(true);
    this.jobsError.set('');
    try {
      const { jobs, total } = await this.inferenceService.listJobs(
        this.pageSize,
        this.jobsOffset(),
      );
      if (request !== this.jobsRequest || this.destroyRef.destroyed) return;
      if (total > 0 && this.jobsOffset() >= total) {
        this.jobsOffset.set(Math.floor((total - 1) / this.pageSize) * this.pageSize);
        await this.loadJobs();
        return;
      }
      if (!total) this.jobsOffset.set(0);
      this.jobs.set(jobs);
      this.jobsTotal.set(total);
      this.scheduleJobPoll(jobs);
    } catch (err: unknown) {
      if (request !== this.jobsRequest || this.destroyRef.destroyed) return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar histórico';
      this.jobsError.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      if (request === this.jobsRequest) this.loadingJobs.set(false);
    }
  }

  private async submitUploadJob(): Promise<void> {
    this.submissionStage.set('Iniciando inferência…');
    const imageIds =
      this.selectedUploadId() === this.queryUploadId && this.queryImageId !== undefined
        ? [this.queryImageId]
        : undefined;
    const response = await this.inferenceService.createUploadJob(
      this.selectedModelId(),
      this.selectedUploadId(),
      imageIds,
    );
    this.snackBar.open('Execução de inferência criada com sucesso!', 'Fechar', { duration: 4000 });
    await this.router.navigate(['/inference', response.id]);
  }

  private async submitTempJob(): Promise<void> {
    const files = this.tempFiles();
    const types = validateUploadImages(files);
    const fileDescs = files.map((f, index) => ({
      fileName: f.name,
      contentType: types[index],
      sizeBytes: f.size,
    }));

    const response = await this.inferenceService.createTempJob(this.selectedModelId(), fileDescs);

    if (response.files) {
      let uploaded = 0;
      for (const instruction of response.files) {
        const file = files[instruction.imageIndex];
        if (!file) continue;
        if (!instruction.uploadUrl) continue;
        this.submissionStage.set(`Enviando imagem ${uploaded + 1} de ${files.length}…`);

        const headers: Record<string, string> = {
          'Content-Type': types[instruction.imageIndex],
          ...(instruction.headers ?? {}),
        };
        const putResponse = await this.presignedUploadService.putFile(instruction.uploadUrl, file, {
          method: 'PUT',
          headers,
        });
        if (!putResponse.ok) {
          throw new Error(
            `Falha ao enviar arquivo "${file.name}": ${putResponse.status} ${putResponse.statusText}`,
          );
        }
        uploaded++;
      }
    }

    this.submissionStage.set('Iniciando inferência…');
    await this.inferenceService.completeTempJob(response.id);
    this.snackBar.open('Execução de inferência criada com sucesso!', 'Fechar', { duration: 4000 });
    await this.router.navigate(['/inference', response.id]);
  }

  private scheduleJobPoll(jobs: InferenceJobListItem[]): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const hasActive = jobs.some((j) => ['queued', 'uploading', 'running'].includes(j.status));

    if (!hasActive || this.destroyRef.destroyed) return;

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.loadJobs();
    }, 5000);
  }
}
