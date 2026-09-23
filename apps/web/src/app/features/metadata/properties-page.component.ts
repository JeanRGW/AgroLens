import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { ResizableColumnsDirective } from '../../shared/directives/resizable-columns.directive';
import { uuidValidator } from '../../shared/utils/uuid.validator';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { AutocompleteFieldComponent } from '../../shared/components/autocomplete-field/autocomplete-field.component';
import { AutocompleteOption } from '../../shared/models/autocomplete-option';
import { PropertyRecord } from '@agrolens/contracts';
import { METADATA_CONFIGS } from './metadata-crud-config';

@Component({
  selector: 'app-properties-page',
  standalone: true,
  imports: [
    AutocompleteFieldComponent,
    ReactiveFormsModule,
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
    LocationPickerComponent,
    ResizableColumnsDirective,
  ],
  template: `
    <section class="page">
      <app-page-header
        [eyebrow]="config.eyebrow"
        [title]="config.pluralLabel"
        [subtitle]="config.subtitle"
      >
        <button mat-flat-button color="primary" (click)="refresh()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          Atualizar
        </button>
      </app-page-header>

      @if (loading()) {
        <app-loading-state message="Carregando propriedades..." />
      } @else {
        <div class="content-grid">
          <mat-card class="form-card" [class.is-saving]="saving()">
            <mat-card-header>
              <mat-card-title>
                {{ editingId() ? 'Editar propriedade' : 'Nova propriedade' }}
              </mat-card-title>
            </mat-card-header>

            <mat-card-content>
              <form [formGroup]="form" (ngSubmit)="saveProperty()" class="form-grid">
                <mat-form-field appearance="outline">
                  <mat-label>Nome</mat-label>
                  <input matInput formControlName="name" maxlength="80" />
                  @if (form.controls.name.hasError('required') && form.controls.name.touched) {
                    <mat-error>Nome é obrigatório</mat-error>
                  } @else if (form.controls.name.hasError('minlength')) {
                    <mat-error>Mínimo de 2 caracteres</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Responsável</mat-label>
                  <input matInput formControlName="owner" maxlength="80" />
                  @if (form.controls.owner.invalid && form.controls.owner.touched) {
                    <mat-error>Responsável é obrigatório</mat-error>
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

                <mat-form-field appearance="outline" class="full-span">
                  <mat-label>Endereço</mat-label>
                  <input matInput formControlName="address" maxlength="140" />
                  @if (form.controls.address.invalid && form.controls.address.touched) {
                    <mat-error>Endereço é obrigatório</mat-error>
                  }
                </mat-form-field>

                <div class="location-section full-span">
                  <label class="location-label">Localização</label>
                  <app-location-picker
                    height="280px"
                    [latitude]="form.controls.latitude.value"
                    [longitude]="form.controls.longitude.value"
                    (locationSelected)="onLocationSelected($event)"
                  />
                  @if (
                    (form.controls.latitude.invalid || form.controls.longitude.invalid) &&
                    (form.controls.latitude.touched || form.controls.longitude.touched)
                  ) {
                    <mat-error class="location-error">
                      Selecione uma localização válida no mapa
                    </mat-error>
                  }
                </div>

                <div class="actions full-span">
                  <button mat-button type="button" (click)="cancelEdit()">Limpar</button>
                  <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <mat-icon>save</mat-icon>
                    }
                    Salvar propriedade
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
                <h2>Lista de propriedades</h2>
                <span>{{ properties().length }} registros</span>
              </div>

              @if (properties().length === 0 && !loading()) {
                <app-empty-state
                  [icon]="config.emptyState.icon"
                  [title]="config.emptyState.title"
                  [message]="config.emptyState.message"
                />
              } @else {
                <div class="table-wrap">
                  <table mat-table appResizableColumns [dataSource]="properties()">
                    <ng-container matColumnDef="name">
                      <th mat-header-cell *matHeaderCellDef>Nome</th>
                      <td mat-cell *matCellDef="let row">{{ row.name }}</td>
                    </ng-container>

                    <ng-container matColumnDef="owner">
                      <th mat-header-cell *matHeaderCellDef>Responsável</th>
                      <td mat-cell *matCellDef="let row">{{ row.owner || '-' }}</td>
                    </ng-container>

                    <ng-container matColumnDef="address">
                      <th mat-header-cell *matHeaderCellDef>Endereço</th>
                      <td mat-cell *matCellDef="let row">{{ row.address || '-' }}</td>
                    </ng-container>

                    <ng-container matColumnDef="latitude">
                      <th mat-header-cell *matHeaderCellDef>Latitude</th>
                      <td mat-cell *matCellDef="let row">{{ row.latitude || '-' }}</td>
                    </ng-container>

                    <ng-container matColumnDef="longitude">
                      <th mat-header-cell *matHeaderCellDef>Longitude</th>
                      <td mat-cell *matCellDef="let row">{{ row.longitude || '-' }}</td>
                    </ng-container>

                    <ng-container matColumnDef="actions">
                      <th mat-header-cell *matHeaderCellDef>Ações</th>
                      <td mat-cell *matCellDef="let row" class="action-cell">
                        <app-crud-actions
                          [showEdit]="isOwnRecord(row)"
                          [showDelete]="isOwnRecord(row)"
                          (edit)="editProperty(row)"
                          (delete)="deleteProperty(row)"
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
export class PropertiesPageComponent implements OnInit {
  protected readonly config = METADATA_CONFIGS.properties;
  private readonly catalogService = inject(CatalogsService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly properties = signal<PropertyRecord[]>([]);
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

  isOwnRecord(row: PropertyRecord): boolean {
    return this.isAdmin() || row.userId === this.currentUserId();
  }

  readonly columns = [...this.config.columns];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    owner: ['', Validators.required],
    userEmail: [''],
    userId: [{ value: '', disabled: true }, [Validators.required, uuidValidator]],
    address: ['', Validators.required],
    latitude: [
      null as number | null,
      [Validators.required, Validators.min(-90), Validators.max(90)],
    ],
    longitude: [
      null as number | null,
      [Validators.required, Validators.min(-180), Validators.max(180)],
    ],
  });

  ngOnInit(): void {
    this.resetFormWithDefaults();
    void this.loadProperties();
  }

  private async loadProperties(): Promise<void> {
    try {
      this.properties.set(await this.catalogService.listProperties());
    } catch {
      this.snackBar.open('Falha ao carregar propriedades.', 'Fechar', {
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
        owner: '',
        userEmail: user?.fullName || user?.email || '',
        userId: user?.id ?? '',
        address: '',
        latitude: null,
        longitude: null,
      },
      { emitEvent: false },
    );
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.properties.set(await this.catalogService.listProperties());
    } catch {
      this.snackBar.open('Falha ao carregar propriedades.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.loading.set(false);
    }
  }

  async editProperty(property: PropertyRecord): Promise<void> {
    if (!this.isOwnRecord(property)) {
      this.snackBar.open('Você só pode editar suas próprias propriedades.', 'Fechar', {
        duration: 3500,
      });
      return;
    }
    this.editingId.set(property.id);
    if (this.isAdmin()) this.form.controls.userId.enable();

    let userLabel = '';
    const currentUser = this.authService.user();
    if (property.userId === currentUser?.id) {
      userLabel = currentUser.fullName || currentUser.email || '';
    }

    this.form.setValue(
      {
        name: property.name,
        owner: property.owner,
        userEmail: userLabel,
        userId: property.userId,
        address: property.address,
        latitude: property.latitude,
        longitude: property.longitude,
      },
      { emitEvent: false },
    );

    if (!userLabel && property.userId) {
      const resolved = await this.usersService.resolveUser(property.userId);
      if (this.editingId() === property.id && resolved) {
        const resolvedLabel =
          resolved.fullName || (resolved as { email?: string }).email || property.userId;
        this.form.controls.userEmail.setValue(resolvedLabel, { emitEvent: false });
      }
    }
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.resetFormWithDefaults();
  }

  onLocationSelected(location: { latitude: number; longitude: number }): void {
    this.form.patchValue({
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  async saveProperty(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      if (this.editingId()) {
        await this.catalogService.updateProperty(this.editingId()!, {
          name: raw.name,
          ...(this.isAdmin() &&
          raw.userId !== this.properties().find((item) => item.id === this.editingId())?.userId
            ? { userId: raw.userId }
            : {}),
          owner: raw.owner,
          address: raw.address,
          latitude: raw.latitude!,
          longitude: raw.longitude!,
        });
      } else {
        await this.catalogService.createProperty({
          name: raw.name,
          owner: raw.owner,
          address: raw.address,
          latitude: raw.latitude!,
          longitude: raw.longitude!,
        });
      }
      this.snackBar.open('Propriedade salva com sucesso.', 'Fechar', {
        duration: 2500,
      });
      this.cancelEdit();
      await this.loadProperties();
    } catch {
      this.snackBar.open('Não foi possível salvar a propriedade.', 'Fechar', {
        duration: 3500,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async deleteProperty(property: PropertyRecord): Promise<void> {
    if (!this.isOwnRecord(property)) {
      this.snackBar.open('Você só pode excluir suas próprias propriedades.', 'Fechar', {
        duration: 3500,
      });
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Excluir propriedade',
        message: `Tem certeza que deseja excluir "${property.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        confirmColor: 'warn',
      },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;

    try {
      await this.catalogService.deleteProperty(property.id);
      this.properties.update((items) => items.filter((item) => item.id !== property.id));
      this.snackBar.open('Propriedade excluída.', 'Fechar', { duration: 2500 });
      if (this.editingId() === property.id) {
        this.cancelEdit();
      }
    } catch {
      this.snackBar.open('Não foi possível excluir a propriedade.', 'Fechar', {
        duration: 3500,
      });
    }
  }
}
