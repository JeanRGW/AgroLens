import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { OfflineCatalogCacheService } from '../../core/services/offline-catalog-cache.service';
import { OfflineCoordinatorService } from '../../core/services/offline-coordinator.service';
import { OfflinePreparationService } from '../../core/services/offline-preparation.service';
import { OfflineUploadSyncService } from '../../core/services/offline-upload-sync.service';

@Component({
  selector: 'app-offline-status',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  template: `
    <button
      mat-icon-button
      type="button"
      class="status-button"
      [class.ready]="preparation.ready()"
      [class.attention]="attention()"
      [class.syncing]="sync.syncing()"
      [matMenuTriggerFor]="statusMenu"
      [attr.aria-label]="statusLabel()"
      [matTooltip]="statusLabel()"
    >
      <mat-icon
        aria-hidden="true"
        [matBadge]="pendingCount() > 0 ? pendingCount() : null"
        matBadgeSize="small"
        [matBadgeHidden]="pendingCount() === 0"
        [matBadgeColor]="attention() ? 'warn' : 'accent'"
        matBadgeDescription="Lotes na fila offline"
        >{{ statusIcon() }}</mat-icon
      >
    </button>
    <mat-menu #statusMenu="matMenu" xPosition="before">
      <div class="menu-header">
        <mat-icon aria-hidden="true">{{ statusIcon() }}</mat-icon>
        <div>
          <p class="menu-title">{{ statusTitle() }}</p>
          <p class="menu-subtitle">{{ queueText() }}</p>
        </div>
      </div>
      <div class="menu-details">
        <p>
          Coleta neste dispositivo: <strong>{{ auth.user()?.fullName }}</strong
          >.
        </p>
        <p>
          {{ connection.online() ? 'Com conexão.' : 'Sem conexão.' }} Os lotes sincronizam com o
          aplicativo aberto ou ao retornar para ele.
        </p>
        <p>
          Catálogos:
          {{ catalogs.available() ? 'salvos neste dispositivo' : 'ainda não disponíveis' }}.
          @if (catalogs.savedAt(); as savedAt) {
            Última atualização: {{ savedAt | date: 'dd/MM/yyyy HH:mm' }}.
          }
        </p>
        <p>
          Aplicativo:
          {{ preparation.shellReady() ? 'baixado para uso offline' : 'download offline pendente' }}.
          Armazenamento:
          {{
            preparation.storageAvailable()
              ? preparation.persistent()
                ? 'persistente'
                : 'disponível; retenção gerenciada pelo navegador'
              : 'indisponível'
          }}.
        </p>
        @if (preparation.availableBytes() !== null) {
          <p>
            Espaço local estimado: {{ (preparation.availableBytes()! / 1048576).toFixed(0) }} MB.
          </p>
        }
        @if (!auth.identitySaved()) {
          <p class="error">Não foi possível salvar a identidade neste dispositivo.</p>
        }
        @if (combinedError(); as statusError) {
          <p class="error">{{ statusError }}</p>
        }
        @if (auth.reauthenticationRequired()) {
          <p class="session-hint">
            A sessão online expirou ou mudou. Você pode continuar coletando como
            {{ auth.user()?.fullName }}.
          </p>
        }
        <p class="hint">
          No iPhone, abra o app pela Tela de Início e conclua esta preparação com conexão antes de
          ir ao campo.
        </p>
      </div>
      <button
        mat-menu-item
        type="button"
        [disabled]="preparation.preparing() || catalogs.refreshing() || !connection.online()"
        (click)="connection.run(true)"
      >
        <mat-icon aria-hidden="true">cloud_download</mat-icon>
        <span>Preparar / atualizar offline</span>
      </button>
      <a mat-menu-item routerLink="/uploads/queue">
        <mat-icon aria-hidden="true">sync</mat-icon>
        <span>Ver fila</span>
      </a>
      @if (auth.reauthenticationRequired()) {
        <a mat-menu-item routerLink="/login" [queryParams]="{ redirect: '/uploads/queue' }">
          <mat-icon aria-hidden="true">login</mat-icon>
          <span>Entrar para sincronizar</span>
        </a>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    .status-button.ready mat-icon {
      color: var(--agri-accent-dark, #264b2f);
    }
    .status-button.attention mat-icon {
      color: #8a5a00;
    }
    .status-button.syncing mat-icon {
      animation: offline-spin 1.2s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .status-button.syncing mat-icon {
        animation: none;
      }
    }
    @keyframes offline-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .menu-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem 0.25rem;
    }
    .menu-title {
      margin: 0;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .menu-subtitle {
      margin: 0.15rem 0 0;
      font-size: 0.78rem;
      color: var(--mat-menu-item-label-text-color, rgba(0, 0, 0, 0.6));
    }
    .menu-details {
      padding: 0 1rem 0.5rem;
      font-size: 0.82rem;
      max-width: 20rem;
    }
    .menu-details p {
      margin: 0.5rem 0;
    }
    .error {
      color: #b3261e;
    }
    .session-hint {
      font-weight: 600;
    }
    .hint {
      color: var(--mat-menu-item-label-text-color, rgba(0, 0, 0, 0.6));
    }
  `,
})
export class OfflineStatusComponent {
  readonly auth = inject(AuthService);
  readonly catalogs = inject(OfflineCatalogCacheService);
  readonly preparation = inject(OfflinePreparationService);
  readonly connection = inject(OfflineCoordinatorService);
  readonly sync = inject(OfflineUploadSyncService);

  readonly pendingCount = computed(() => this.connection.pendingCount());

  readonly combinedError = computed(
    () => this.preparation.error() || this.catalogs.error() || this.connection.error(),
  );

  readonly statusIcon = computed(() => {
    if (this.sync.syncing()) return 'sync';
    if (this.auth.reauthenticationRequired()) return 'sync_problem';
    if (!this.connection.online()) return 'cloud_off';
    if (this.preparation.ready()) return 'offline_pin';
    return 'cloud_download';
  });

  readonly statusTitle = computed(() => {
    if (this.sync.syncing()) return 'Sincronizando...';
    if (this.auth.reauthenticationRequired()) return 'Sessão expirada';
    if (!this.connection.online()) return 'Sem conexão';
    if (this.preparation.ready()) return 'Pronto para coleta offline';
    if (this.preparation.preparing()) return 'Preparando modo offline...';
    return 'Modo offline ainda não preparado';
  });

  readonly queueText = computed(() => {
    if (this.sync.syncing()) return 'Sincronizando...';
    const count = this.pendingCount();
    return count === 0 ? 'Nenhum lote na fila' : `${count} lote(s) na fila`;
  });

  readonly statusLabel = computed(() => `${this.statusTitle()}. ${this.queueText()}.`);

  readonly attention = computed(() => {
    if (this.sync.syncing() || this.preparation.preparing()) return false;
    return (
      this.auth.reauthenticationRequired() ||
      !!this.combinedError() ||
      (this.connection.online() && !this.preparation.ready())
    );
  });
}
