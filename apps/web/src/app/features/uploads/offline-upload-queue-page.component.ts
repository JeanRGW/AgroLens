import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

import { AuthService } from '../../core/services/auth.service';
import { OfflineUploadStoreService } from '../../core/services/offline-upload-store.service';
import { OfflineUploadSyncService } from '../../core/services/offline-upload-sync.service';
import { OfflineUpload } from '../../shared/models/offline-upload';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { OfflineUploadDetailDialogComponent } from './offline-upload-detail-dialog.component';
import { OfflineCoordinatorService } from '../../core/services/offline-coordinator.service';
import { canCorrectOfflineUpload, offlineErrorMessage } from '../../shared/utils/offline-errors';
import { withBrowserLock } from '../../shared/utils/browser-lock';

@Component({
  selector: 'app-offline-upload-queue-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <section class="queue-page">
      <app-page-header
        eyebrow="Coleta offline"
        title="Fila de sincronização"
        subtitle="Os dados ficam neste dispositivo até serem sincronizados."
      >
        <div class="header-actions">
          <a mat-stroked-button routerLink="/uploads/new"
            ><mat-icon>add_photo_alternate</mat-icon>Novo lote</a
          >
          <button
            mat-flat-button
            color="primary"
            [disabled]="syncing() || !online() || !uploads().length"
            (click)="syncAll()"
          >
            <mat-icon>sync</mat-icon>{{ syncing() ? 'Sincronizando...' : 'Sincronizar agora' }}
          </button>
        </div>
      </app-page-header>

      @if (!online()) {
        <div class="offline-notice">
          <mat-icon>cloud_off</mat-icon>Sem conexão. Você ainda pode criar lotes para sincronizar
          depois.
        </div>
      }

      @if (syncing()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (uploads().length) {
        <div class="queue-list">
          @for (upload of uploads(); track upload.id) {
            <mat-card>
              <mat-card-content class="queue-item">
                @if (previewUrl(upload)) {
                  <img class="queue-preview" [src]="previewUrl(upload)" alt="Prévia do lote" />
                }
                <div class="queue-summary">
                  <strong>
                    {{ upload.files.length }}
                    {{ upload.files.length === 1 ? 'imagem' : 'imagens' }}
                  </strong>
                  <span>{{ upload.request.activityDate | date: 'dd/MM/yyyy HH:mm' }}</span>
                  <span class="status" [class]="upload.status">{{
                    statusLabel(upload.status)
                  }}</span>
                  @if (upload.errorMessage) {
                    <small class="error">{{ upload.errorMessage }}</small>
                  }
                  @if (upload.retryAfter) {
                    <small
                      >Nova tentativa automática após {{ upload.retryAfter | date: 'HH:mm:ss' }} com
                      o app aberto.</small
                    >
                  }
                  @if (removingIds().has(upload.id)) {
                    <small role="status">Excluindo lote local...</small>
                  }
                  @if (canCorrect(upload) && !removingIds().has(upload.id)) {
                    <a mat-button routerLink="/uploads/new" [queryParams]="{ localId: upload.id }"
                      >Corrigir lote</a
                    >
                  }
                </div>
                <div class="item-actions">
                  <button
                    mat-icon-button
                    aria-label="Ver detalhes do lote"
                    (click)="openDetails(upload)"
                  >
                    <mat-icon>visibility</mat-icon>
                  </button>
                  @if (upload.status !== 'completed') {
                    <button
                      mat-icon-button
                      aria-label="Sincronizar lote"
                      [disabled]="syncing() || !online() || removingIds().has(upload.id)"
                      (click)="syncOne(upload)"
                    >
                      <mat-icon>sync</mat-icon>
                    </button>
                  }
                  <button
                    mat-icon-button
                    aria-label="Excluir lote local"
                    [disabled]="removingIds().has(upload.id)"
                    (click)="remove(upload)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>
      } @else {
        <app-empty-state
          icon="cloud_done"
          title="Nenhum lote na fila"
          message="Os lotes salvos neste dispositivo aparecerão aqui."
        />
      }
      @if (loadError()) {
        <p class="error" role="alert">{{ loadError() }}</p>
      }
    </section>
  `,
  styles: `
    .queue-page,
    .queue-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .header-actions,
    .item-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .offline-notice {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: #fff3cd;
      color: #664d03;
    }
    .queue-item {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
    }
    .queue-preview {
      width: 56px;
      height: 56px;
      flex: 0 0 56px;
      border-radius: 8px;
      object-fit: cover;
    }
    .queue-summary {
      flex: 1;
      min-width: 0;
    }
    strong,
    span,
    small {
      display: block;
    }
    .queue-item span:not(.status) {
      color: var(--agri-text-secondary);
      font-size: 0.85rem;
      margin-top: 0.2rem;
    }
    .error {
      color: #b3261e;
      margin-top: 0.3rem;
    }
    .status {
      font-size: 0.8rem;
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
    @media (max-width: 720px) {
      .header-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .queue-item {
        align-items: start;
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr) 40px;
        gap: 0.6rem;
      }

      .queue-preview {
        height: 52px;
        width: 52px;
      }

      .queue-summary {
        grid-column: 2;
        grid-row: 1;

        span:not(.status) {
          font-size: 0.75rem;
        }
      }

      .item-actions {
        align-items: center;
        align-self: center;
        flex-direction: column;
        gap: 0;
        grid-column: 3;
        grid-row: 1;
        justify-self: end;
      }
    }
  `,
})
export class OfflineUploadQueuePageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly store = inject(OfflineUploadStoreService);
  private readonly syncService = inject(OfflineUploadSyncService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly connection = inject(OfflineCoordinatorService);

  readonly uploads = signal<OfflineUpload[]>([]);
  readonly removingIds = signal<ReadonlySet<string>>(new Set());
  private readonly manualSyncing = signal(false);
  readonly syncing = computed(() => this.manualSyncing() || this.syncService.syncing());
  readonly online = this.connection.online;
  readonly loadError = signal('');
  readonly canCorrect = canCorrectOfflineUpload;
  private readonly previewUrls = new Map<string, string>();
  private loadSequence = 0;

  constructor() {
    effect(() => {
      this.store.changes();
      this.authService.user();
      untracked(() => void this.load());
    });
  }

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => {
      this.clearPreviews();
    });
    await this.load();
  }

  async syncAll(): Promise<void> {
    await this.syncPending();
  }

  async syncOne(upload: OfflineUpload): Promise<void> {
    this.manualSyncing.set(true);
    try {
      await this.syncService.sync(upload);
      await this.load();
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Erro ao sincronizar lote',
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.manualSyncing.set(false);
    }
  }

  async remove(upload: OfflineUpload): Promise<void> {
    if (
      this.removingIds().has(upload.id) ||
      !confirm('Excluir este lote local? Esta ação não pode ser desfeita.')
    )
      return;
    this.removingIds.update((ids) => new Set([...ids, upload.id]));
    try {
      const remove = async () => {
        const current = await this.store.get(upload.id);
        if (!current) return;
        if (this.authService.user()?.id !== upload.userId || current.userId !== upload.userId) {
          throw new Error('A conta mudou. Reabra a fila com a conta que salvou este lote.');
        }
        await this.store.delete(upload.id);
      };
      await withBrowserLock(`agrolens-upload:${upload.id}`, remove);
      await this.load();
    } catch (error) {
      this.loadError.set(offlineErrorMessage(error));
    } finally {
      this.removingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(upload.id);
        return next;
      });
    }
  }

  openDetails(upload: OfflineUpload): void {
    this.dialog.open(OfflineUploadDetailDialogComponent, {
      data: { upload },
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  statusLabel(status: OfflineUpload['status']): string {
    return {
      pending: 'Pendente',
      syncing: 'Sincronizando',
      failed: 'Falhou',
      completed: 'Concluído',
    }[status];
  }

  private async syncPending(): Promise<void> {
    const userId = this.authService.user()?.id;
    if (!userId || this.syncing()) return;
    this.manualSyncing.set(true);
    try {
      await this.syncService.syncAll(userId);
      await this.load();
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Erro ao sincronizar fila',
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.manualSyncing.set(false);
    }
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    const userId = this.authService.user()?.id;
    if (!userId) {
      this.uploads.set([]);
      this.clearPreviews();
      return;
    }
    try {
      const uploads = await this.store.list(userId);
      if (
        this.destroyRef.destroyed ||
        sequence !== this.loadSequence ||
        this.authService.user()?.id !== userId
      )
        return;
      const pending: OfflineUpload[] = [];
      for (const upload of uploads) {
        if (upload.status === 'completed') {
          await this.store.delete(upload.id);
          continue;
        }
        pending.push(upload);
      }
      this.clearPreviews();
      pending.forEach((upload) => {
        const firstFile = upload.files[0];
        if (firstFile) this.previewUrls.set(upload.id, URL.createObjectURL(firstFile.blob));
      });
      this.uploads.set(pending);
      this.loadError.set('');
    } catch (error) {
      if (sequence === this.loadSequence) this.loadError.set(offlineErrorMessage(error));
    }
  }

  previewUrl(upload: OfflineUpload): string | undefined {
    return this.previewUrls.get(upload.id);
  }

  private clearPreviews(): void {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls.clear();
  }
}
