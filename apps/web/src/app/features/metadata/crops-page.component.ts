import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';

import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { CrudActionsComponent } from '../../shared/components/crud-actions.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ResizableColumnsDirective } from '../../shared/directives/resizable-columns.directive';
import { uuidValidator } from '../../shared/utils/uuid.validator';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { AutocompleteFieldComponent } from '../../shared/components/autocomplete-field/autocomplete-field.component';
import { AutocompleteOption } from '../../shared/models/autocomplete-option';
import { CropTypeRecord } from '@agrolens/contracts';

@Component({
  selector: 'app-crops-page',
  standalone: true,
  imports: [
    AutocompleteFieldComponent,
    ReactiveFormsModule,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    CrudActionsComponent,
    ResizableColumnsDirective,
  ],
  template: `
    <section class="page">
      <app-page-header
        eyebrow="Cadastros"
        title="Culturas"
        subtitle="Gerencie as opções exibidas no cadastro de uploads."
      >
        <button mat-flat-button color="primary" (click)="refresh()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          Atualizar
        </button>
      </app-page-header>

      @if (loading()) {
        <app-loading-state message="Carregando culturas..." />
      } @else {
        <div class="content-grid">
          <mat-card class="form-card" [class.is-saving]="saving()">
            <mat-card-header>
              <mat-card-title>
                {{ editingId() ? 'Editar cultura' : 'Nova cultura' }}
              </mat-card-title>
            </mat-card-header>

            <mat-card-content>
              <form [formGroup]="form" (ngSubmit)="saveCrop()" class="form-grid">
                <mat-form-field appearance="outline" class="full-span">
                  <mat-label>Nome</mat-label>
                  <input matInput formControlName="name" maxlength="80" />
                  @if (form.controls.name.hasError('required') && form.controls.name.touched) {
                    <mat-error>Nome é obrigatório</mat-error>
                  } @else if (form.controls.name.hasError('minlength')) {
                    <mat-error>Mínimo de 2 caracteres</mat-error>
                  }
                </mat-form-field>

                @if (!(isAdmin() && editingId())) {
                  <mat-form-field appearance="outline" class="full-span">
                    <mat-label>Usuário</mat-label>
                    <input
                      matInput
                      [value]="form.controls.userEmail.value || form.controls.userId.value"
                      readonly
                    />
                    <mat-icon matPrefix>person</mat-icon>
                  </mat-form-field>
                }
                @if (isAdmin() && editingId()) {
                  <app-autocomplete-field
                    class="full-span"
                    label="Usuário"
                    placeholder="Buscar por nome, e-mail ou ID"
                    [searchControl]="form.controls.userEmail"
                    [valueControl]="form.controls.userId"
                    [searchFn]="searchUserOptions"
                    prefixIcon="person_search"
                    [required]="true"
                    [showValueHint]="true"
                    errorMessage="Selecione um usuário válido"
                  />
                }

                <div class="actions full-span">
                  <button mat-button type="button" (click)="cancelEdit()">Limpar</button>
                  <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <mat-icon>save</mat-icon>
                    }
                    Salvar cultura
                  </button>
                </div>
              </form>
            </mat-card-content>
          </mat-card>

          <mat-card class="table-card">
            @if (loading()) {
              <mat-progress-bar mode="indeterminate"></mat-progress-bar>
            }
            <mat-card-content>
              <div class="table-title-row">
                <h2>Lista de culturas</h2>
                <span>{{ crops().length }} registros</span>
              </div>

              @if (crops().length === 0 && !loading()) {
                <app-empty-state
                  icon="grass"
                  title="Nenhuma cultura cadastrada"
                  message="Use o formulário ao lado para cadastrar a primeira cultura."
                />
              } @else {
                <div class="table-wrap">
                  <table mat-table appResizableColumns [dataSource]="crops()">
                    <ng-container matColumnDef="name">
                      <th mat-header-cell *matHeaderCellDef>Nome</th>
                      <td mat-cell *matCellDef="let row">{{ row.name }}</td>
                    </ng-container>

                    <ng-container matColumnDef="createdAt">
                      <th mat-header-cell *matHeaderCellDef>Criado em</th>
                      <td mat-cell *matCellDef="let row">
                        {{ row.createdAt ? (row.createdAt | date: 'dd/MM/yyyy HH:mm') : '-' }}
                      </td>
                    </ng-container>

                    <ng-container matColumnDef="actions">
                      <th mat-header-cell *matHeaderCellDef>Ações</th>
                      <td mat-cell *matCellDef="let row" class="action-cell">
                        <app-crud-actions
                          [showEdit]="isOwnRecord(row)"
                          [showDelete]="isOwnRecord(row)"
                          (edit)="editCrop(row)"
                          (delete)="deleteCrop(row)"
                        />
                      </td>
                    </ng-container>

                    <tr mat-header-row *matHeaderRowDef="columns"></tr>
                    <tr
                      mat-row
                      *matRowDef="let row; columns: columns"
                      [class.editing-row]="editingId() === row.id"
                    ></tr>
                  </table>
                </div>
              }
            </mat-card-content>
          </mat-card>
        </div>
      }
    </section>
  `,
  styleUrl: './metadata-page.styles.scss',
})
export class CropsPageComponent implements OnInit {
  private readonly catalogService = inject(CatalogsService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly crops = signal<CropTypeRecord[]>([]);
  readonly editingId = signal<string | null>(null);

  readonly isAdmin = this.authService.isAdmin;
  readonly searchUserOptions = async (term: string): Promise<AutocompleteOption[]> =>
    (await this.usersService.lookupUsers(term)).map((user) => ({
      value: user.id,
      label: user.fullName || user.email || user.id,
      secondary: user.email,
      selectionText: user.fullName || user.email || user.id,
    }));
  readonly currentUserId = computed(() => this.authService.user()?.id ?? '');

  isOwnRecord(row: CropTypeRecord): boolean {
    return this.isAdmin() || row.userId === this.currentUserId();
  }

  readonly columns = ['name', 'createdAt', 'actions'];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    userEmail: [''],
    userId: [{ value: '', disabled: true }, [Validators.required, uuidValidator]],
  });

  ngOnInit(): void {
    this.resetFormWithDefaults();
    void this.loadCrops();
  }

  private async loadCrops(): Promise<void> {
    try {
      this.crops.set(await this.catalogService.listCropTypes());
    } catch {
      this.snackBar.open('Falha ao carregar culturas.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.loading.set(false);
    }
  }

  private resetFormWithDefaults(): void {
    this.form.controls.userId.disable();
    const user = this.authService.user();
    this.form.reset(
      {
        name: '',
        userEmail: user?.fullName || user?.email || '',
        userId: user?.id ?? '',
      },
      { emitEvent: false },
    );
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.crops.set(await this.catalogService.listCropTypes());
    } catch {
      this.snackBar.open('Falha ao carregar culturas.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.loading.set(false);
    }
  }

  async editCrop(crop: CropTypeRecord): Promise<void> {
    if (!this.isOwnRecord(crop)) {
      this.snackBar.open('Você só pode editar suas próprias culturas.', 'Fechar', {
        duration: 3500,
      });
      return;
    }
    this.editingId.set(crop.id);
    if (this.isAdmin()) this.form.controls.userId.enable();

    let userLabel = '';
    const currentUser = this.authService.user();
    if (crop.userId === currentUser?.id) {
      userLabel = currentUser.fullName || currentUser.email || '';
    }

    this.form.setValue(
      {
        name: crop.name,
        userEmail: userLabel,
        userId: crop.userId,
      },
      { emitEvent: false },
    );

    if (!userLabel && crop.userId) {
      const resolved = await this.usersService.resolveUser(crop.userId);
      if (this.editingId() === crop.id && resolved) {
        const resolvedLabel =
          resolved.fullName || (resolved as { email?: string }).email || crop.userId;
        this.form.controls.userEmail.setValue(resolvedLabel, { emitEvent: false });
      }
    }
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.resetFormWithDefaults();
  }

  async saveCrop(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      if (this.editingId()) {
        await this.catalogService.updateCropType(this.editingId()!, {
          name: raw.name,
          ...(this.isAdmin() &&
          raw.userId !== this.crops().find((item) => item.id === this.editingId())?.userId
            ? { userId: raw.userId }
            : {}),
        });
      } else {
        await this.catalogService.createCropType({
          name: raw.name,
        });
      }
      this.snackBar.open('Cultura salva com sucesso.', 'Fechar', {
        duration: 2500,
      });
      this.cancelEdit();
      await this.loadCrops();
    } catch {
      this.snackBar.open('Não foi possível salvar a cultura.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async deleteCrop(crop: CropTypeRecord): Promise<void> {
    if (!this.isOwnRecord(crop)) {
      this.snackBar.open('Você só pode excluir suas próprias culturas.', 'Fechar', {
        duration: 3500,
      });
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Excluir cultura',
        message: `Tem certeza que deseja excluir "${crop.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        confirmColor: 'warn',
      },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;

    try {
      await this.catalogService.deleteCropType(crop.id);
      this.crops.update((items) => items.filter((item) => item.id !== crop.id));
      this.snackBar.open('Cultura excluída.', 'Fechar', { duration: 2500 });
      if (this.editingId() === crop.id) {
        this.cancelEdit();
      }
    } catch {
      this.snackBar.open('Não foi possível excluir a cultura.', 'Fechar', {
        duration: 3500,
      });
    }
  }
}
