import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { validateUploadImages } from '../../shared/utils/upload-validation';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';

import { InferenceService } from '../../core/services/inference.service';
import { UploadsService } from '../../core/services/uploads.service';
import { PresignedUploadService } from '../../core/services/presigned-upload.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InferenceJobListItem, InferenceModelSummary } from '@agrolens/contracts';
import { UploadRecord } from '../../shared/models/upload-record';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
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
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
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

  // Uploads
  readonly uploads = signal<UploadRecord[]>([]);

  // Form
  readonly selectedModelId = signal('');
  readonly sourceType = signal<'upload' | 'temp'>('upload');
  readonly selectedUploadId = signal('');
  readonly tempFiles = signal<File[]>([]);

  // Form state
  readonly submitting = signal(false);
  readonly error = signal('');

  // Jobs
  readonly jobs = signal<InferenceJobListItem[]>([]);
  readonly jobsTotal = signal(0);
  readonly jobsOffset = signal(0);
  readonly loadingJobs = signal(false);
  readonly pageSize = 20;

  // Polling
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private queryUploadId: string | null = null;
  private queryImageId: string | undefined;
  private jobsRequest = 0;

  readonly jobColumns = ['status', 'sourceType', 'progress', 'createdAt', 'expiresAt', 'actions'];

  readonly statusBadgeClass = (status: string) => STATUS_BADGE[status] || '';
  readonly statusLabel = (status: string) => STATUS_LABEL[status] || status;

  readonly canSubmit = computed(() => {
    if (!this.selectedModelId()) return false;
    if (this.sourceType() === 'upload') return !!this.selectedUploadId();
    return this.tempFiles().length > 0;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.pollTimer !== null) {
        clearTimeout(this.pollTimer);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.queryUploadId = this.route.snapshot.queryParamMap.get('uploadId');
    this.queryImageId = this.route.snapshot.queryParamMap.get('imageId') ?? undefined;

    await Promise.all([this.loadModels(), this.loadUploads(), this.loadJobs()]);

    if (this.queryUploadId && this.uploads().some((upload) => upload.id === this.queryUploadId)) {
      this.selectedUploadId.set(this.queryUploadId);
    }
  }

  onTempFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const newFiles = Array.from(input.files);
    input.value = '';

    try {
      validateUploadImages(newFiles);
    } catch {
      this.snackBar.open('Selecione imagens JPEG, PNG ou WebP não vazias.', 'Fechar', {
        duration: 6000,
      });
      return;
    }

    const current = this.tempFiles();
    const total = current.length + newFiles.length;

    if (total > 20) {
      this.snackBar.open('Máximo de 20 arquivos permitidos.', 'Fechar', { duration: 6000 });
      return;
    }

    for (const f of newFiles) {
      if (f.size > 25 * 1024 * 1024) {
        this.snackBar.open(`Arquivo "${f.name}" excede 25 MB.`, 'Fechar', { duration: 6000 });
        return;
      }
    }

    this.tempFiles.set([...current, ...newFiles]);
  }

  removeTempFile(index: number): void {
    this.tempFiles.update((files) => files.filter((_, i) => i !== index));
  }

  async submitInference(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) return;

    this.submitting.set(true);
    this.error.set('');

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
    this.jobsOffset.update((o) => o + this.pageSize);
    void this.loadJobs();
  }

  prevJobsPage(): void {
    this.jobsOffset.update((o) => Math.max(0, o - this.pageSize));
    void this.loadJobs();
  }

  // ─── Private ────────────────────────────────────────────────

  private async loadModels(): Promise<void> {
    this.loadingModels.set(true);
    try {
      const models = await this.inferenceService.listActiveModels();
      this.models.set(models);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar modelos';
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      this.loadingModels.set(false);
    }
  }

  private async loadUploads(): Promise<void> {
    try {
      const result = await this.uploadsService.listUploads(undefined, 50, 0);
      this.uploads.set(result.records);
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
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    }
  }

  private async loadJobs(): Promise<void> {
    const request = ++this.jobsRequest;
    this.loadingJobs.set(true);
    try {
      const { jobs, total } = await this.inferenceService.listJobs(
        this.pageSize,
        this.jobsOffset(),
      );
      if (request !== this.jobsRequest || this.destroyRef.destroyed) return;
      this.jobs.set(jobs);
      this.jobsTotal.set(total);
      this.scheduleJobPoll(jobs);
    } catch (err: unknown) {
      if (request !== this.jobsRequest || this.destroyRef.destroyed) return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar histórico';
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
    } finally {
      if (request === this.jobsRequest) this.loadingJobs.set(false);
    }
  }

  private async submitUploadJob(): Promise<void> {
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
      for (const instruction of response.files) {
        const file = files[instruction.imageIndex];
        if (!file) continue;
        if (!instruction.uploadUrl) continue;

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
      }
    }

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

    if (!hasActive) return;

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.loadJobs();
    }, 5000);
  }
}
