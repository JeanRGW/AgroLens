import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AccessGrantsService } from '../../core/services/access-grants.service';
import { UsersService } from '../../core/services/users.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UploadsService } from '../../core/services/uploads.service';
import { AccessGrant } from '@agrolens/contracts';
import { AutocompleteOption } from '../../shared/models/autocomplete-option';
import { RESOURCE_TYPES, ResourceType } from '@agrolens/contracts';
import { isResourceType, RESOURCE_LABELS } from '../../shared/labels';
import { AutocompleteFieldComponent } from '../../shared/components/autocomplete-field/autocomplete-field.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-access-admin-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTooltipModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    DatePipe,
    AutocompleteFieldComponent,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <section class="access-page">
      <app-page-header
        eyebrow="Administração"
        title="Gestão de Permissões"
        subtitle="Adicione ou revogue acesso a recursos para usuários específicos."
      />

      <div class="main-content">
        <!-- Form Card -->
        <mat-card class="form-card">
          <mat-card-header>
            <mat-card-title>Conceder Novo Acesso</mat-card-title>
          </mat-card-header>
          <mat-divider></mat-divider>
          <mat-card-content>
            <form class="grant-form" [formGroup]="form" (ngSubmit)="grantAccess()">
              <!-- User Section -->
              <div class="form-section">
                <h3>
                  <mat-icon color="primary">person_search</mat-icon>
                  Identificação do Usuário
                </h3>
                <div class="form-grid">
                  <app-autocomplete-field
                    label="Buscar usuário por nome ou email"
                    [searchControl]="form.controls.subjectSearch"
                    [valueControl]="form.controls.subjectUid"
                    [searchFn]="searchUserOptions"
                    [prefixIcon]="'search'"
                    [autoActiveFirstOption]="true"
                    [showValueHint]="false"
                    (optionSelected)="chooseUser($event)"
                    (exactMatchChange)="onUserExactMatch($event)"
                  />

                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>ID do usuário alvo</mat-label>
                    <input matInput formControlName="subjectUid" placeholder="Ex: aB3dE5..." />
                    <mat-icon matPrefix>fingerprint</mat-icon>
                    @if (form.controls.subjectUid.hasError('required')) {
                      <mat-error>ID é obrigatório</mat-error>
                    }
                  </mat-form-field>
                </div>
                @if (selectedUserName()) {
                  <div class="selection-indicator success">
                    <mat-icon>check_circle</mat-icon>
                    <span
                      >Usuário Selecionado: <strong>{{ selectedUserName() }}</strong></span
                    >
                  </div>
                }
              </div>

              <!-- Resource Section -->
              <div class="form-section">
                <h3>
                  <mat-icon color="primary">folder_shared</mat-icon>
                  Permissão ao Recurso
                </h3>
                <div class="form-grid resource-grid">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Tipo de recurso</mat-label>
                    <mat-select formControlName="resourceType">
                      @for (type of resourceTypes; track type) {
                        <mat-option [value]="type">
                          {{ resourceLabels[type] }}
                        </mat-option>
                      }
                    </mat-select>
                    <mat-icon matPrefix>category</mat-icon>
                  </mat-form-field>

                  <app-autocomplete-field
                    label="Buscar por nome ou ID"
                    [searchControl]="form.controls.resourceSearch"
                    [valueControl]="form.controls.resourceId"
                    [searchFn]="searchResourceOptions"
                    [prefixIcon]="'search'"
                    [autoActiveFirstOption]="true"
                    [showValueHint]="false"
                    (optionSelected)="chooseResource($event)"
                    (exactMatchChange)="onResourceExactMatch($event)"
                  />
                </div>

                @if (selectedResourceName()) {
                  <div class="selection-indicator success">
                    <mat-icon>check_circle</mat-icon>
                    <span
                      >Recurso Selecionado: <strong>{{ selectedResourceName() }}</strong></span
                    >
                  </div>
                }
              </div>

              <!-- Context Section -->
              <div class="form-section">
                <h3>
                  <mat-icon color="primary">info</mat-icon>
                  Contexto (Opcional)
                </h3>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="full-width">
                  <mat-label>Comentário sobre a concessão</mat-label>
                  <input
                    matInput
                    formControlName="reason"
                    placeholder="Ex: Acesso temporário para auditoria"
                  />
                  <mat-icon matPrefix>edit_note</mat-icon>
                </mat-form-field>
              </div>

              <mat-divider style="margin: 1rem 0"></mat-divider>

              <div class="actions-row">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="!canSubmit()"
                  class="primary-action"
                >
                  <mat-icon>vpn_key</mat-icon>
                  Conceder Acesso
                </button>

                <button
                  mat-stroked-button
                  type="button"
                  (click)="loadUserGrants()"
                  [disabled]="loading() || !form.controls.subjectUid.value"
                >
                  <mat-icon>sync</mat-icon>
                  Carregar Atuais
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>

        <!-- List Card -->
        <mat-card class="table-card">
          <mat-card-header>
            <mat-card-title>Permissões Ativas do Usuário</mat-card-title>
            <mat-card-subtitle>
              @if (form.controls.subjectUid.value) {
                Exibindo acessos para:
                <span class="mono">{{ form.controls.subjectUid.value }}</span>
              } @else {
                Selecione um usuário para visualizar seus acessos.
              }
            </mat-card-subtitle>
          </mat-card-header>
          <mat-divider></mat-divider>

          <div class="table-container">
            @if (loading()) {
              <app-loading-state message="Buscando permissões..." />
            } @else if (!form.controls.subjectUid.value && !grants().length) {
              <app-empty-state
                icon="person_search"
                title="Nenhum usuário selecionado"
                message="Informe o ID ou email do usuário para listar seus acessos."
              />
            } @else if (!grants().length) {
              <app-empty-state
                icon="gpp_bad"
                title="Nenhum acesso encontrado"
                message="O usuário informado não possui permissões específicas concedidas."
              />
            } @else {
              <table mat-table [dataSource]="grants()" class="grants-table">
                <ng-container matColumnDef="resourceType">
                  <th mat-header-cell *matHeaderCellDef>Recurso</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="resource-badge">{{ resourceTypeLabel(row.resourceType) }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="resourceId">
                  <th mat-header-cell *matHeaderCellDef>ID / Detalhes</th>
                  <td mat-cell *matCellDef="let row" class="mono">
                    {{ row.resourceId }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="grantedBy">
                  <th mat-header-cell *matHeaderCellDef>Responsável</th>
                  <td mat-cell *matCellDef="let row" class="mono subtle">
                    {{ row.grantedByName || row.grantedByUserId }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="grantedAt">
                  <th mat-header-cell *matHeaderCellDef>Data de Concessão</th>
                  <td mat-cell *matCellDef="let row" class="subtle">
                    @if (row.grantedAt) {
                      {{ row.grantedAt | date: 'dd/MM/yyyy HH:mm' }}
                    } @else {
                      -
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="reason">
                  <th mat-header-cell *matHeaderCellDef>Motivo</th>
                  <td mat-cell *matCellDef="let row" class="subtle">
                    {{ row.reason || '-' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="actionsColumn">
                  <th mat-header-cell *matHeaderCellDef class="align-right"></th>
                  <td mat-cell *matCellDef="let row" class="align-right">
                    @if (!row.revokedAt) {
                      <button
                        mat-icon-button
                        color="warn"
                        matTooltip="Revogar acesso"
                        (click)="revokeAccess(row)"
                      >
                        <mat-icon>delete_sweep</mat-icon>
                      </button>
                    } @else {
                      <span class="revoked-badge">Revogado</span>
                    }
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns" class="grant-row"></tr>
              </table>
            }
          </div>

          @if (totalPages() > 1) {
            <div class="pagination-wrap">
              <button
                mat-stroked-button
                type="button"
                (click)="goToPage(currentPage() - 1)"
                [disabled]="loading() || currentPage() <= 1"
              >
                <mat-icon>arrow_back</mat-icon>
                Anterior
              </button>

              <span class="page-info">
                Página {{ currentPage() }} de {{ totalPages() }} ({{ total() }} concessões)
              </span>

              <button
                mat-stroked-button
                type="button"
                (click)="goToPage(currentPage() + 1)"
                [disabled]="loading() || currentPage() >= totalPages()"
              >
                Próxima
                <mat-icon>arrow_forward</mat-icon>
              </button>
            </div>
          }
        </mat-card>
      </div>
    </section>
  `,
  styles: `
    .access-page {
      display: grid;
      gap: 0.5rem;
    }

    .main-content {
      display: grid;
      // Left track hugs the grant form (global .form-card caps it at 480px);
      // leftover space goes to the grants table that needs the width.
      grid-template-columns: minmax(420px, 480px) minmax(0, 1fr);
      gap: 0.5rem;
      align-items: start;
    }

    .form-card,
    .table-card {
      min-width: 0;
      border-radius: 16px;
      overflow: hidden;
    }

    .table-card {
      mat-card-header {
        padding: 1rem 1.35rem 0.75rem;
      }
    }

    .form-card {
      mat-card-header {
        padding: 1rem 1.35rem 0.75rem;
      }

      mat-card-content {
        padding: 0.9rem 1.35rem 1.1rem;
      }

      ::ng-deep app-autocomplete-field .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
    }

    .form-section {
      padding: 0.1rem 0;

      h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.92rem;
        color: var(--agri-text);
        margin: 0rem 0 1rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      & + .form-section {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px dashed var(--agri-border);
      }
    }

    .form-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(0, 1fr);

      mat-form-field,
      app-autocomplete-field {
        min-width: 0;
        width: 100%;
      }
    }

    .resource-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .full-width {
      width: 100%;
      margin-top: 0;
    }

    .selection-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.85rem;
      border-radius: 10px;
      font-size: 0.82rem;
      margin-top: 0.4rem;
      transition: all 0.2s ease;

      &.success {
        background: var(--agri-fill);
        color: var(--agri-accent-dark);
        border: 1px solid var(--agri-border-subtle);

        mat-icon {
          font-size: 18px;
          height: 18px;
          width: 18px;
          color: var(--agri-accent);
        }
      }
    }

    .actions-row {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 0.7rem;
      padding-top: 0.8rem;
      border-top: 1px solid var(--agri-border);

      .primary-action {
        padding: 0 1.75rem;
      }
    }

    .table-container {
      overflow-x: auto;
      padding: 0.75rem 1rem 1rem;
    }

    .table-container app-empty-state,
    .table-container app-loading-state {
      display: block;
      padding: 1.5rem 0;
    }

    .grants-table {
      width: 100%;
      min-width: 900px;

      th.mat-mdc-header-cell,
      td.mat-mdc-cell {
        padding: 0.85rem 0.75rem;
      }

      th.mat-mdc-header-cell {
        color: var(--agri-text-muted);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .align-right {
        text-align: right;
      }
    }

    .grant-row {
      transition: background-color 0.15s ease;

      &:hover {
        background-color: var(--agri-fill-hover);
      }
    }

    .resource-badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      background: var(--agri-fill);
      color: var(--agri-accent-dark);
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .revoked-badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .mono {
      font-family: var(--agri-mono);
      font-size: 0.82rem;
      overflow-wrap: anywhere;

      &.subtle {
        color: var(--agri-text-muted);
      }
    }

    .pagination-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem 1rem;
      border-top: 1px solid var(--agri-border);
      background: var(--agri-fill-subtle);

      button {
        min-width: 120px;
        gap: 0.35rem;
        white-space: nowrap;
      }
    }

    .page-info {
      font-size: 0.82rem;
      color: var(--agri-text-muted);
      font-weight: 500;
    }

    @media (max-width: 1100px) {
      .main-content {
        grid-template-columns: 1fr;
      }

      .resource-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .actions-row {
        justify-content: stretch;

        button {
          flex: 1 1 100%;
        }
      }
    }
  `,
})
export class AccessAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private grantsRequest = 0;
  private readonly fb = inject(FormBuilder);
  private readonly grantsService = inject(AccessGrantsService);
  private readonly usersService = inject(UsersService);
  private readonly catalogsService = inject(CatalogsService);
  private readonly uploadsService = inject(UploadsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly selectedUserName = signal<string>('');
  readonly selectedResourceName = signal<string>('');
  readonly grants = signal<AccessGrant[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = 50;

  readonly resourceTypes = RESOURCE_TYPES;
  readonly resourceLabels = RESOURCE_LABELS;
  readonly displayedColumns = [
    'resourceType',
    'resourceId',
    'grantedBy',
    'grantedAt',
    'reason',
    'actionsColumn',
  ];

  readonly form = this.fb.nonNullable.group({
    subjectUid: ['', Validators.required],
    subjectSearch: [''],
    resourceType: ['upload' as ResourceType, Validators.required],
    resourceId: ['', Validators.required],
    resourceSearch: [''],
    reason: [''],
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  canSubmit(): boolean {
    return this.form.valid && !this.submitting() && !this.loading();
  }

  ngOnInit(): void {
    this.form.controls.subjectUid.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearGrants());
    this.form.controls.subjectSearch.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearGrants());
    this.form.controls.resourceType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.resourceId.reset('', { emitEvent: true });
        this.form.controls.resourceSearch.reset('', { emitEvent: true });
        this.selectedResourceName.set('');
      });
  }

  readonly searchUserOptions = async (term: string): Promise<AutocompleteOption[]> => {
    const users = await this.usersService.lookupUsers(term);
    return users.map((u) => ({
      value: u.id,
      label: u.fullName || u.email || '',
      secondary: u.email,
      selectionText: u.fullName || u.email || '',
    }));
  };

  readonly searchResourceOptions = async (term: string): Promise<AutocompleteOption[]> => {
    const resourceType = this.form.controls.resourceType.value;
    const normalized = term.trim().toLowerCase();
    if (normalized.length < 2) return [];

    if (resourceType === 'upload') {
      return this.searchUploadOptions(normalized, 10);
    }

    let list: Array<{ id: string; name?: string }> = [];

    switch (resourceType) {
      case 'property':
        list = await this.catalogsService.listProperties();
        break;
      case 'talhao':
        list = await this.catalogsService.listTalhoes();
        break;
      case 'crop_type':
        list = await this.catalogsService.listCropTypes();
        break;
      case 'estadio':
        list = await this.catalogsService.listEstadios();
        break;
      default:
        return [];
    }

    return list
      .filter(
        (item) =>
          item.id.toLowerCase().includes(normalized) ||
          (item.name || '').toLowerCase().includes(normalized),
      )
      .slice(0, 10)
      .map((item) => ({
        value: item.id,
        label: item.name || item.id,
        selectionText: item.name || item.id,
        secondary: `ID: ${item.id}`,
      }));
  };

  private async searchUploadOptions(term: string, maxItems: number): Promise<AutocompleteOption[]> {
    const result = await this.uploadsService.listUploads({ search: term }, maxItems, 0);
    return result.records.map((item) => ({
      value: item.id,
      label: item.id,
      selectionText: item.id,
      secondary:
        [item.propertyName, item.talhaoName, item.cropTypeName].filter(Boolean).join(' | ') ||
        'Upload',
    }));
  }

  chooseUser(item: AutocompleteOption): void {
    this.clearGrants();
    this.form.controls.subjectUid.setValue(item.value, { emitEvent: false });
    this.selectedUserName.set(item.label);
  }

  chooseResource(item: AutocompleteOption): void {
    this.form.controls.resourceId.setValue(item.value, { emitEvent: false });
    this.selectedResourceName.set(item.label);
  }

  onUserExactMatch(item: AutocompleteOption | null): void {
    this.clearGrants();
    this.selectedUserName.set(item?.label || '');
  }

  onResourceExactMatch(item: AutocompleteOption | null): void {
    this.selectedResourceName.set(item?.label || '');
  }

  private clearGrants(): void {
    this.grantsRequest++;
    this.grants.set([]);
    this.total.set(0);
    this.currentPage.set(1);
    this.loading.set(false);
  }

  async loadUserGrants(page = 1): Promise<void> {
    const request = ++this.grantsRequest;
    const subjectUid = this.form.controls.subjectUid.value.trim();
    if (!subjectUid) {
      this.snackBar.open('Informe um ID para carregar os acessos.', 'Fechar', { duration: 2800 });
      return;
    }

    this.loading.set(true);
    this.currentPage.set(page);

    try {
      const result = await this.grantsService.listGrants({
        subjectUserId: subjectUid,
        page,
        pageSize: this.pageSize,
      });
      if (
        request !== this.grantsRequest ||
        this.destroyRef.destroyed ||
        subjectUid !== this.form.controls.subjectUid.value.trim()
      )
        return;
      this.grants.set(result.grants);
      this.total.set(result.total);
    } catch {
      if (request !== this.grantsRequest || this.destroyRef.destroyed) return;
      this.snackBar.open('Falha ao carregar os acessos do usuário.', 'Fechar', { duration: 3200 });
    } finally {
      if (request === this.grantsRequest) this.loading.set(false);
    }
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;
    await this.loadUserGrants(page);
  }

  async grantAccess(): Promise<void> {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    try {
      const value = this.form.getRawValue();

      await this.grantsService.createGrant({
        subjectUserId: value.subjectUid.trim(),
        resourceType: value.resourceType,
        resourceId: value.resourceId.trim(),
        reason: value.reason.trim() || undefined,
      });

      this.form.controls.resourceId.reset('');
      this.form.controls.resourceSearch.reset('');
      this.form.controls.reason.reset('');
      this.selectedResourceName.set('');

      await this.loadUserGrants();
      this.snackBar.open('Acesso concedido com sucesso.', 'Fechar', {
        duration: 2400,
      });
    } catch {
      this.snackBar.open('Não foi possível conceder o acesso.', 'Fechar', { duration: 3400 });
    } finally {
      this.submitting.set(false);
    }
  }

  async revokeAccess(grant: AccessGrant): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Revogar acesso',
        message: `Tem certeza que deseja revogar o acesso ao recurso ${grant.resourceId}?`,
        confirmText: 'Revogar',
        confirmColor: 'warn',
      },
    });

    if (!(await firstValueFrom(ref.afterClosed()))) return;

    this.loading.set(true);

    try {
      await this.grantsService.revokeGrant(grant.id);

      this.grants.update((items) =>
        items.map((item) =>
          item.id === grant.id ? { ...item, revokedAt: new Date().toISOString() } : item,
        ),
      );
      this.snackBar.open('Acesso revogado.', 'Fechar', { duration: 2200 });
    } catch {
      this.snackBar.open('Falha ao revogar o acesso.', 'Fechar', {
        duration: 3200,
      });
    } finally {
      this.loading.set(false);
    }
  }

  resourceTypeLabel(value: unknown): string {
    return isResourceType(value) ? this.resourceLabels[value] : `${value ?? '-'}`;
  }
}
