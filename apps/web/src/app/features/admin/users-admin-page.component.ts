import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { USER_ROLES, UserRole, UserPublic } from '@agrolens/contracts';
import { ROLE_LABELS } from '../../shared/labels';
import { RegisterUserDialogComponent } from '../../shared/components/register-user-dialog/register-user-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { CopyIdButtonComponent } from '../../shared/components/copy-id-button.component';
import { ResetPasswordDialogComponent } from '../../shared/components/reset-password-dialog/reset-password-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ResizableColumnsDirective } from '../../shared/directives/resizable-columns.directive';
import { formatPhone } from '../../shared/utils/record-utils';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-users-admin-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    CopyIdButtonComponent,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    ResizableColumnsDirective,
  ],
  template: `
    <section class="users-page">
      <app-page-header eyebrow="Administração" title="Gestão de Usuários">
        <div class="header-actions">
          <button mat-stroked-button type="button" (click)="openRegisterUserDialog()">
            <mat-icon>person_add</mat-icon>
            Registrar novo usuário
          </button>

          <button mat-stroked-button type="button" (click)="loadUsers()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            Recarregar
          </button>
        </div>
      </app-page-header>

      <mat-card>
        <mat-card-content>
          <form class="filters" [formGroup]="filtersForm">
            <mat-form-field appearance="outline">
              <mat-label>Buscar por nome, ID ou email</mat-label>
              <input matInput formControlName="searchTerm" placeholder="Digite para filtrar" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Função</mat-label>
              <mat-select formControlName="role">
                <mat-option value="all">Todos</mat-option>
                @for (role of roleOptions; track role) {
                  <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </form>
        </mat-card-content>
      </mat-card>

      @if (loading()) {
        <app-loading-state />
      } @else {
        <mat-card>
          <mat-card-content>
            <div class="table-meta">
              @if (total() > 0) {
                <span class="count-badge">{{ total() }} usuários</span>
              }
            </div>

            @if (users().length) {
              <ng-template #roleEditor let-row="row">
                <mat-form-field appearance="outline" class="role-select" subscriptSizing="dynamic">
                  <mat-select
                    [value]="row.role"
                    (selectionChange)="updateRole(row, $event.value)"
                    [disabled]="savingUserId() === row.id"
                  >
                    @for (role of roleOptions; track role) {
                      <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </ng-template>

              <ng-template #resetAction let-row="row">
                <button
                  mat-stroked-button
                  type="button"
                  class="reset-btn"
                  (click)="resetPassword(row)"
                  [disabled]="savingUserId() === row.id"
                >
                  @if (savingUserId() === row.id) {
                    <mat-spinner diameter="16" class="btn-spinner" />
                  } @else {
                    <mat-icon>password</mat-icon>
                  }
                  Redefinir senha
                </button>
              </ng-template>

              <ng-template #disabledAction let-row="row">
                <button
                  mat-stroked-button
                  type="button"
                  class="reset-btn"
                  (click)="toggleDisabled(row)"
                  [disabled]="savingUserId() === row.id || isSelf(row)"
                  [title]="isSelf(row) ? 'Você não pode suspender sua própria conta' : ''"
                >
                  @if (savingUserId() === row.id) {
                    <mat-spinner diameter="16" class="btn-spinner" />
                  } @else {
                    <mat-icon>{{ isDisabled(row) ? 'check_circle' : 'block' }}</mat-icon>
                  }
                  {{ isDisabled(row) ? 'Reativar' : 'Suspender' }}
                </button>
              </ng-template>

              <div class="table-wrap">
                <table mat-table appResizableColumns [dataSource]="users()" class="users-table">
                  <ng-container matColumnDef="fullName">
                    <th mat-header-cell *matHeaderCellDef>Nome</th>
                    <td mat-cell *matCellDef="let row">{{ row.fullName }}</td>
                  </ng-container>

                  <ng-container matColumnDef="id">
                    <th mat-header-cell *matHeaderCellDef>ID</th>
                    <td mat-cell *matCellDef="let row">
                      <app-copy-id-button [id]="row.id" copiedMessage="ID do usuário copiado." />
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="email">
                    <th mat-header-cell *matHeaderCellDef>Email</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.email || '-' }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="phone">
                    <th mat-header-cell *matHeaderCellDef>Telefone</th>
                    <td mat-cell *matCellDef="let row">
                      {{ formatPhoneDisplay(row.phone) }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="role">
                    <th mat-header-cell *matHeaderCellDef>Função</th>
                    <td mat-cell *matCellDef="let row" class="role-cell">
                      <ng-container *ngTemplateOutlet="roleEditor; context: { row: row }" />
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef>Status</th>
                    <td mat-cell *matCellDef="let row">
                      <span
                        class="status-badge"
                        [class.status-suspended]="isDisabled(row)"
                        [class.status-active]="!isDisabled(row)"
                      >
                        {{ isDisabled(row) ? 'Suspenso' : 'Ativo' }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Ações</th>
                    <td mat-cell *matCellDef="let row">
                      <div class="cell-actions">
                        <ng-container *ngTemplateOutlet="resetAction; context: { row: row }" />
                        <ng-container *ngTemplateOutlet="disabledAction; context: { row: row }" />
                      </div>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
                </table>
              </div>

              <div class="user-cards">
                @for (user of users(); track user.id) {
                  <article class="user-card">
                    <div class="user-card-head">
                      <h3>{{ user.fullName }}</h3>
                      <p>{{ user.email || '-' }}</p>
                    </div>
                    <dl class="user-card-details">
                      <div>
                        <dt>ID</dt>
                        <dd>
                          <app-copy-id-button
                            [id]="user.id"
                            copiedMessage="ID do usuário copiado."
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Telefone</dt>
                        <dd>{{ formatPhoneDisplay(user.phone) }}</dd>
                      </div>
                      <div>
                        <dt>Função</dt>
                        <dd>
                          <ng-container *ngTemplateOutlet="roleEditor; context: { row: user }" />
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          <span
                            class="status-badge"
                            [class.status-suspended]="isDisabled(user)"
                            [class.status-active]="!isDisabled(user)"
                          >
                            {{ isDisabled(user) ? 'Suspenso' : 'Ativo' }}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <ng-container *ngTemplateOutlet="resetAction; context: { row: user }" />
                    <ng-container *ngTemplateOutlet="disabledAction; context: { row: user }" />
                  </article>
                }
              </div>
            }

            @if (!users().length) {
              <app-empty-state
                title="Nenhum usuário encontrado"
                message="Nenhum usuário corresponde aos filtros informados."
              />
            }

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

                <span class="page-info"> Página {{ currentPage() }} de {{ totalPages() }} </span>

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
          </mat-card-content>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .users-page {
      display: grid;
      // Explicit track so wide table content can't stretch the section and
      // push sibling cards (e.g. filters) past the viewport on mobile.
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
    }

    .users-page > mat-card {
      min-width: 0;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .filters {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 0.75rem;
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

    .user-cards {
      display: none;
    }

    .user-card {
      border: 1px solid var(--agri-border);
      border-radius: 12px;
      padding: 0.9rem 1rem;
      background: var(--agri-surface);
      display: grid;
      gap: 0.7rem;
    }

    .user-card-head h3 {
      margin: 0;
      font-size: 1rem;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }

    .user-card-head p {
      margin: 0.15rem 0 0;
      font-size: 0.84rem;
      color: var(--agri-text-secondary);
      overflow-wrap: anywhere;
    }

    .user-card-details {
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.55rem;
    }

    .user-card-details > div {
      display: grid;
      gap: 0.15rem;
    }

    .user-card-details dt {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--agri-text-muted);
    }

    .user-card-details dd {
      margin: 0;
      font-size: 0.9rem;
      overflow-wrap: anywhere;
    }

    .users-table {
      width: 100%;

      td.mat-mdc-cell {
        vertical-align: middle;
      }
    }

    .cell-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .reset-btn {
      height: 2rem;
      line-height: 2rem;
      font-size: 0.72rem;
      white-space: nowrap;
    }

    .btn-spinner {
      margin-right: 0.4rem;
    }

    .role-cell {
      vertical-align: middle;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      height: 1.4rem;
      padding: 0 0.6rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .status-active {
      background: var(--agri-fill);
      color: var(--agri-accent-dark);
    }

    .status-suspended {
      background: color-mix(in srgb, var(--mat-warn, #ba1a1a) 12%, transparent);
      color: var(--mat-warn, #ba1a1a);
    }

    .role-select {
      width: 170px;
      margin: 0;
      display: inline-flex;
      vertical-align: middle;

      ::ng-deep {
        .mat-mdc-text-field-wrapper {
          padding: 0 12px;
        }

        .mat-mdc-form-field-infix {
          min-height: 36px;
          padding-top: 6px;
          padding-bottom: 6px;
        }

        .mat-mdc-select-value {
          font-size: 0.84rem;
        }
      }
    }

    .pagination-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.75rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--agri-border);
    }

    .page-info {
      font-size: 0.82rem;
      color: var(--agri-text-muted);
      font-weight: 500;
    }

    @media (max-width: 900px) {
      .filters {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .table-wrap {
        display: none;
      }

      .user-cards {
        display: grid;
        gap: 0.75rem;
      }

      .user-card .role-select {
        width: 100%;
      }

      .user-card .reset-btn {
        width: 100%;
        justify-content: center;
      }

      .pagination-wrap {
        flex-wrap: wrap;
      }
    }
  `,
})
export class UsersAdminPageComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private usersRequest = 0;

  readonly loading = signal(true);
  readonly savingUserId = signal<string | null>(null);
  readonly users = signal<UserPublic[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = 50;

  readonly roleLabels = ROLE_LABELS;
  readonly roleOptions = USER_ROLES;
  readonly displayedColumns = ['fullName', 'id', 'email', 'phone', 'role', 'status', 'actions'];

  readonly filtersForm = this.fb.nonNullable.group({
    searchTerm: [''],
    role: ['all' as UserRole | 'all'],
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  private readonly searchTerm = toSignal(this.filtersForm.controls.searchTerm.valueChanges, {
    initialValue: this.filtersForm.controls.searchTerm.value,
  });

  private readonly roleFilter = toSignal(this.filtersForm.controls.role.valueChanges, {
    initialValue: this.filtersForm.controls.role.value,
  });

  constructor() {
    // Reset to page 1 when filters change
    this.filtersForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.currentPage.set(1);
      void this.loadUsers();
    });
  }

  ngOnInit(): void {
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    const request = ++this.usersRequest;
    this.loading.set(true);
    try {
      const searchTerm = this.searchTerm().trim();
      const roleFilter = this.roleFilter();

      const params: {
        search?: string;
        role?: UserRole;
        page: number;
        pageSize: number;
      } = {
        page: this.currentPage(),
        pageSize: this.pageSize,
      };
      if (searchTerm) params.search = searchTerm;
      if (roleFilter !== 'all') params.role = roleFilter;

      const result = await this.usersService.listUsers(params);
      if (request !== this.usersRequest || this.destroyRef.destroyed) return;
      this.users.set(result.users);
      this.total.set(result.total);
    } catch {
      if (request !== this.usersRequest || this.destroyRef.destroyed) return;
      this.snackBar.open('Erro ao carregar usuários.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      if (request === this.usersRequest) this.loading.set(false);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    void this.loadUsers();
  }

  formatPhoneDisplay(phone?: string | null): string {
    return phone ? formatPhone(phone) : '-';
  }

  isDisabled(row: UserPublic): boolean {
    return row.disabledAt !== undefined && row.disabledAt !== null;
  }

  isSelf(row: UserPublic): boolean {
    return this.authService.user()?.id === row.id;
  }

  private resolveAdminErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage =
        typeof error.error?.message === 'string'
          ? error.error.message
          : Array.isArray(error.error?.message)
            ? error.error.message.join(' ')
            : '';
      const haystack = `${serverMessage}`.toLowerCase();
      if (haystack.includes('last active admin')) {
        return 'Não é possível remover o último administrador.';
      }
      if (haystack.includes('own')) {
        return 'Você não pode alterar sua própria conta.';
      }
      if (serverMessage) return serverMessage;
      if (error.status === 403) return 'Operação não permitida para esta conta.';
    }
    return fallback;
  }

  async updateRole(row: UserPublic, role: UserRole): Promise<void> {
    if (row.role === role || this.savingUserId() === row.id) {
      return;
    }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Alterar função do usuário',
        message: `Deseja alterar a função de ${row.fullName} para ${ROLE_LABELS[role]}?`,
        confirmText: 'Confirmar',
        confirmColor: 'primary',
      },
    });

    if (!(await firstValueFrom(ref.afterClosed()))) return;

    this.savingUserId.set(row.id);

    try {
      await this.usersService.setUserRole(row.id, role);

      this.users.update((items) =>
        items.map((item) => (item.id === row.id ? { ...item, role } : item)),
      );

      // Refresh own auth state if changing own role
      if (this.authService.user()?.id === row.id) {
        await this.authService.refreshSession();
      }

      this.snackBar.open('Perfil de acesso atualizado.', 'Fechar', {
        duration: 2600,
      });
    } catch (error) {
      this.snackBar.open(
        this.resolveAdminErrorMessage(error, 'Não foi possível atualizar o perfil.'),
        'Fechar',
        {
          duration: 3500,
        },
      );
    } finally {
      this.savingUserId.set(null);
    }
  }

  async toggleDisabled(row: UserPublic): Promise<void> {
    if (this.savingUserId() === row.id || this.isSelf(row)) {
      return;
    }

    const disabled = this.isDisabled(row);
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: disabled
        ? {
            title: 'Reativar usuário',
            message: `Deseja reativar ${row.fullName}? A pessoa precisará entrar novamente.`,
            confirmText: 'Reativar',
            confirmColor: 'primary',
          }
        : {
            title: 'Suspender usuário',
            message: `Deseja suspender ${row.fullName}? A conta perde acesso imediatamente e todas as sessões são revogadas.`,
            confirmText: 'Suspender',
            confirmColor: 'warn',
          },
    });

    if (!(await firstValueFrom(ref.afterClosed()))) return;

    this.savingUserId.set(row.id);

    try {
      const updated = await this.usersService.setUserDisabled(row.id, !disabled);

      this.users.update((items) =>
        items.map((item) =>
          item.id === row.id ? { ...item, disabledAt: updated.disabledAt ?? null } : item,
        ),
      );

      this.snackBar.open(
        disabled ? 'Usuário reativado.' : 'Usuário suspenso. Sessões revogadas.',
        'Fechar',
        { duration: 3500 },
      );
    } catch (error) {
      this.snackBar.open(
        this.resolveAdminErrorMessage(error, 'Não foi possível atualizar o status.'),
        'Fechar',
        { duration: 3500 },
      );
    } finally {
      this.savingUserId.set(null);
    }
  }

  openRegisterUserDialog(): void {
    const ref = this.dialog.open(RegisterUserDialogComponent, {
      width: '500px',
      disableClose: false,
      data: {},
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        void this.loadUsers();
      }
    });
  }

  async resetPassword(row: UserPublic): Promise<void> {
    if (this.savingUserId() === row.id) {
      return;
    }

    const ref = this.dialog.open(ResetPasswordDialogComponent, {
      width: '420px',
      data: { fullName: row.fullName },
    });

    const newPassword = await firstValueFrom(ref.afterClosed());
    if (!newPassword) return;

    this.savingUserId.set(row.id);
    try {
      await this.usersService.resetUserPassword(row.id, newPassword);
      this.snackBar.open(`Senha de ${row.fullName} redefinida. Sessões revogadas.`, 'Fechar', {
        duration: 3500,
      });
    } catch {
      this.snackBar.open('Não foi possível redefinir a senha.', 'Fechar', { duration: 3500 });
    } finally {
      this.savingUserId.set(null);
    }
  }
}
