import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { InferenceModelsService } from '../../core/services/inference-models.service';
import { PresignedUploadService } from '../../core/services/presigned-upload.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InferenceModelAdmin } from '@agrolens/contracts';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { formatFileSize } from '../../shared/utils/upload-utils';

interface NewModelFormValue {
  name: string;
  version: string;
  description: string;
}

/* ===================================================================
 * Edit Model Dialog (name + description only, version is immutable)
 * =================================================================== */
@Component({
  selector: 'app-edit-model-dialog',
  standalone: true,
  imports: [
    MatSnackBarModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Editar Modelo</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="edit-form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Descrição</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        [mat-dialog-close]="form.value"
        [disabled]="form.invalid"
      >
        Salvar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 360px;
      padding-top: 0.25rem;
    }
  `,
})
class EditModelDialogComponent {
  readonly data = inject<{ name: string; description: string | null }>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.name, Validators.required],
    description: [this.data.description ?? ''],
  });
}

/* ===================================================================
 * Upload Model Dialog
 * =================================================================== */
@Component({
  selector: 'app-upload-model-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Novo Modelo</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="upload-form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Versão</mat-label>
          <input matInput formControlName="version" placeholder="ex: 1.0.0" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Descrição (opcional)</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>

        <div class="file-picker">
          <button
            mat-stroked-button
            type="button"
            (click)="fileInput.click()"
            [disabled]="uploading()"
          >
            <mat-icon>upload_file</mat-icon>
            Escolher arquivo .pt
          </button>
          <input #fileInput type="file" accept=".pt" (change)="onFileSelected($event)" hidden />
          @if (selectedFileName()) {
            <span class="file-name">{{ selectedFileName() }}</span>
          }
        </div>

        @if (uploading()) {
          <div class="progress-wrap">
            <div class="progress-label">Enviando... {{ uploadProgress() }}%</div>
            <mat-progress-bar mode="determinate" [value]="uploadProgress()"></mat-progress-bar>
          </div>
        }

        @if (errorMessage()) {
          <div class="error-msg">{{ errorMessage() }}</div>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null" [disabled]="uploading()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        (click)="submit()"
        [disabled]="form.invalid || !selectedFile() || uploading()"
      >
        @if (uploading()) {
          Enviando...
        } @else {
          Criar Modelo
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .upload-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 400px;
      padding-top: 0.25rem;
    }
    .file-picker {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.25rem;
    }
    .file-name {
      font-size: 0.82rem;
      color: var(--agri-text-secondary);
      font-family: var(--agri-mono);
    }
    .progress-wrap {
      margin-top: 0.5rem;
    }
    .progress-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--agri-accent-dark);
      margin-bottom: 0.3rem;
    }
    .error-msg {
      color: #c62828;
      font-size: 0.82rem;
      font-weight: 500;
      padding: 0.5rem;
      border-radius: 8px;
      background: #fdecea;
    }
  `,
})
export class UploadModelDialogComponent {
  private readonly modelsService = inject(InferenceModelsService);
  private readonly presignedUpload = inject(PresignedUploadService);
  private readonly dialogRef = inject(MatDialogRef<UploadModelDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    version: ['', Validators.required],
    description: [''],
  });

  readonly selectedFile = signal<File | null>(null);
  readonly selectedFileName = signal('');
  readonly uploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly errorMessage = signal('');

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.selectedFileName.set(file?.name ?? '');
    this.errorMessage.set('');
  }

  async submit(): Promise<void> {
    if (this.form.invalid || !this.selectedFile()) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.errorMessage.set('');

    try {
      const { name, version, description } = this.form.getRawValue();
      const file = this.selectedFile()!;

      // Step 1: init model
      const init = await this.modelsService.initModel(name, version, description || undefined);

      // Step 2: PUT file to presigned URL with progress
      await this.uploadFile(file, init.uploadUrl, init.headers);

      // Step 3: complete upload
      const completed = await this.modelsService.completeModelUpload(init.id);

      this.dialogRef.close(completed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar modelo.';
      this.errorMessage.set(msg);
    } finally {
      this.uploading.set(false);
    }
  }

  private async uploadFile(
    file: File,
    url: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const result = await this.presignedUpload.putFile(url, file, {
      method: 'PUT',
      headers,
      onProgress: (percent) => {
        this.uploadProgress.set(percent);
      },
    });
    if (!result.ok) {
      throw new Error(`Upload falhou (status ${result.status})`);
    }
  }
}

/* ===================================================================
 * Main Page Component
 * =================================================================== */
@Component({
  selector: 'app-inference-models-page',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <section class="models-page">
      <app-page-header eyebrow="Administração" title="Modelos de Inferência">
        <div class="header-actions">
          <button mat-stroked-button type="button" (click)="openUploadDialog()">
            <mat-icon>add_circle</mat-icon>
            Novo modelo
          </button>

          <button mat-stroked-button type="button" (click)="loadModels()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            Recarregar
          </button>
        </div>
      </app-page-header>

      @if (loading()) {
        <app-loading-state message="Carregando modelos..." />
      } @else {
        <mat-card>
          <mat-card-content>
            <div class="table-meta">
              @if (models().length > 0) {
                <span class="count-badge">
                  {{ models().length }} {{ models().length === 1 ? 'modelo' : 'modelos' }}
                </span>
              }
            </div>

            @if (models().length) {
              <div class="table-wrap">
                <table mat-table [dataSource]="models()" class="models-table">
                  <!-- Name -->
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef>Modelo</th>
                    <td mat-cell *matCellDef="let row">
                      <button
                        type="button"
                        class="model-name-link"
                        (click)="openEditDialog(row)"
                        title="Clique para editar"
                      >
                        {{ row.name }}
                      </button>
                      <span class="model-version">v{{ row.version }}</span>
                    </td>
                  </ng-container>

                  <!-- Status -->
                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef>Status</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="status-badge" [class]="statusClass(row.status)">
                        {{ statusLabel(row.status) }}
                      </span>
                    </td>
                  </ng-container>

                  <!-- Active -->
                  <ng-container matColumnDef="active">
                    <th mat-header-cell *matHeaderCellDef>Ativo</th>
                    <td mat-cell *matCellDef="let row">
                      <mat-slide-toggle
                        [checked]="row.active"
                        [disabled]="row.status !== 'ready' || togglingId() === row.id"
                        (change)="toggleActive(row, $event.checked)"
                      />
                    </td>
                  </ng-container>

                  <!-- Classes -->
                  <ng-container matColumnDef="classes">
                    <th mat-header-cell *matHeaderCellDef>Classes</th>
                    <td mat-cell *matCellDef="let row">
                      @if (previewClasses(row).length) {
                        <span class="classes-preview">{{ previewClasses(row) }}</span>
                      } @else {
                        <span class="subtle">—</span>
                      }
                    </td>
                  </ng-container>

                  <!-- Checksum -->
                  <ng-container matColumnDef="checksum">
                    <th mat-header-cell *matHeaderCellDef>Soma de verificação</th>
                    <td mat-cell *matCellDef="let row" class="mono subtle">
                      {{ truncatedChecksum(row.sha256) }}
                    </td>
                  </ng-container>

                  <!-- Size -->
                  <ng-container matColumnDef="size">
                    <th mat-header-cell *matHeaderCellDef>Tamanho</th>
                    <td mat-cell *matCellDef="let row" class="subtle">
                      {{ formatSize(row.sizeBytes) }}
                    </td>
                  </ng-container>

                  <!-- Created -->
                  <ng-container matColumnDef="createdAt">
                    <th mat-header-cell *matHeaderCellDef>Criação</th>
                    <td mat-cell *matCellDef="let row" class="subtle">
                      {{ row.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                    </td>
                  </ng-container>

                  <!-- Actions -->
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Ações</th>
                    <td mat-cell *matCellDef="let row" class="actions-cell">
                      @if (togglingId() === row.id) {
                        <span class="saving-tag">Salvando...</span>
                      } @else {
                        @if (row.status === 'invalid') {
                          <button
                            mat-icon-button
                            color="warn"
                            matTooltip="Excluir modelo"
                            aria-label="Excluir modelo"
                            (click)="deleteModel(row)"
                          >
                            <mat-icon>delete</mat-icon>
                          </button>
                        } @else if (!row.active) {
                          <button
                            mat-icon-button
                            color="warn"
                            matTooltip="Excluir modelo inativo"
                            aria-label="Excluir modelo inativo"
                            (click)="deleteModel(row)"
                          >
                            <mat-icon>delete</mat-icon>
                          </button>
                        }
                      }
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
                </table>
              </div>
            }

            @if (!models().length) {
              <app-empty-state
                icon="model_training"
                title="Nenhum modelo de IA"
                message="Adicione modelos de inferência .pt para habilitar a detecção automática."
              />
            }
          </mat-card-content>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .models-page {
      display: grid;
      gap: 1rem;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .table-meta {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      min-width: 1.5rem;
      height: 1.3rem;
      padding: 0 0.5rem;
      background: var(--agri-fill);
      color: var(--agri-accent-dark);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .table-wrap {
      overflow: auto;
    }

    .models-table {
      width: 100%;
    }

    .model-name-link {
      border: 0;
      background: transparent;
      padding: 0;
      font: inherit;
      color: var(--agri-accent);
      cursor: pointer;
      font-weight: 600;
      transition: opacity 0.15s;

      &:hover {
        opacity: 0.8;
        text-decoration: underline;
      }
    }

    .model-version {
      margin-left: 0.4rem;
      font-size: 0.72rem;
      color: var(--agri-text-muted);
      font-family: var(--agri-mono);
    }

    .status-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;

      &.uploading {
        background: #dbeafe;
        color: #1e40af;
      }
      &.validating {
        background: #fef3c7;
        color: #92400e;
      }
      &.ready {
        background: #c8e6c9;
        color: #2e7d32;
      }
      &.invalid {
        background: #fdecea;
        color: #c62828;
      }
    }

    .classes-preview {
      font-size: 0.78rem;
      font-family: var(--agri-mono);
      color: var(--agri-accent-dark);
    }

    .mono {
      font-family: var(--agri-mono);
      font-size: 0.78rem;
      letter-spacing: 0.02em;
    }

    .subtle {
      color: var(--agri-text-muted);
    }

    .saving-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      border-radius: 999px;
      padding: 0.25rem 0.7rem;
      font-size: 0.72rem;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #d97706;
        animation: pulse-dot 1s ease-in-out infinite;
      }
    }

    .actions-cell {
      text-align: right;
      white-space: nowrap;
    }

    @keyframes pulse-dot {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.3;
      }
    }

    @media (max-width: 900px) {
      .header-actions {
        flex-wrap: wrap;
      }
    }
  `,
})
export class InferenceModelsPageComponent implements OnInit {
  private readonly modelsService = inject(InferenceModelsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly models = signal<InferenceModelAdmin[]>([]);
  readonly togglingId = signal<string | null>(null);
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly displayedColumns = [
    'name',
    'status',
    'active',
    'classes',
    'checksum',
    'size',
    'createdAt',
    'actions',
  ];

  readonly hasValidating = computed(() => this.models().some((m) => m.status === 'validating'));

  ngOnInit(): void {
    void this.loadModels();
    this.destroyRef.onDestroy(() => this.clearAutoRefresh());
  }

  async loadModels(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.modelsService.listModels();
      this.models.set(list);
      this.manageAutoRefresh();
    } catch {
      this.snackBar.open('Erro ao carregar modelos.', 'Fechar', { duration: 6000 });
    } finally {
      this.loading.set(false);
    }
  }

  private manageAutoRefresh(): void {
    this.clearAutoRefresh();
    if (this.hasValidating()) {
      this.autoRefreshTimer = setInterval(() => {
        void this.loadModels();
      }, 10_000);
    }
  }

  private clearAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  async toggleActive(model: InferenceModelAdmin, active: boolean): Promise<void> {
    this.togglingId.set(model.id);
    try {
      const updated = await this.modelsService.setModelActive(model.id, active);
      this.models.update((list) => list.map((m) => (m.id === model.id ? updated : m)));
      this.snackBar.open(active ? 'Modelo ativado.' : 'Modelo desativado.', 'Fechar', {
        duration: 4000,
      });
    } catch {
      this.snackBar.open('Falha ao alterar estado do modelo.', 'Fechar', { duration: 6000 });
    } finally {
      this.togglingId.set(null);
    }
  }

  async deleteModel(model: InferenceModelAdmin): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Excluir modelo',
        message: `Deseja excluir o modelo "${model.name}" v${model.version}? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        confirmColor: 'warn',
      },
    });

    if (!(await firstValueFrom(ref.afterClosed()))) return;

    try {
      await this.modelsService.deleteModel(model.id);
      this.models.update((list) => list.filter((m) => m.id !== model.id));
      this.snackBar.open('Modelo excluído com sucesso.', 'Fechar', { duration: 4000 });
    } catch {
      this.snackBar.open('Falha ao excluir o modelo.', 'Fechar', { duration: 6000 });
    }
  }

  openEditDialog(model: InferenceModelAdmin): void {
    const ref = this.dialog.open(EditModelDialogComponent, {
      width: '420px',
      data: { name: model.name, description: model.description },
    });

    ref.afterClosed().subscribe(async (result: NewModelFormValue | null) => {
      if (!result) return;
      try {
        const updated = await this.modelsService.updateModel(model.id, {
          name: result.name,
          description: result.description || null,
        });
        this.models.update((list) => list.map((m) => (m.id === model.id ? updated : m)));
        this.snackBar.open('Modelo atualizado.', 'Fechar', { duration: 4000 });
      } catch {
        this.snackBar.open('Falha ao atualizar o modelo.', 'Fechar', { duration: 6000 });
      }
    });
  }

  openUploadDialog(): void {
    const ref = this.dialog.open(UploadModelDialogComponent, {
      width: '480px',
      disableClose: true,
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        void this.loadModels();
      }
    });
  }

  // ── Display helpers ──

  statusClass(status: string): string {
    return status; // matches CSS class names
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      uploading: 'Enviando',
      validating: 'Validando',
      ready: 'Pronto',
      invalid: 'Inválido',
    };
    return map[status] ?? status;
  }

  previewClasses(model: InferenceModelAdmin): string {
    if (!model.classes || model.classes.length === 0) return '';
    const first = model.classes.slice(0, 3).map((c) => c.name);
    const suffix = model.classes.length > 3 ? ` +${model.classes.length - 3}` : '';
    return first.join(', ') + suffix;
  }

  truncatedChecksum(sha256: string | null): string {
    if (!sha256) return '—';
    return sha256.slice(0, 12) + '…';
  }

  formatSize(bytes: number | null): string {
    return formatFileSize(bytes);
  }
}
