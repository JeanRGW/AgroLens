import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../core/services/auth.service';
import {
  OfflineCatalogCacheService,
  OfflineCatalogs,
} from '../../core/services/offline-catalog-cache.service';
import { OfflineUploadStoreService } from '../../core/services/offline-upload-store.service';
import { OfflineUploadSyncService } from '../../core/services/offline-upload-sync.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InitUploadRequest, UploadSource } from '../../shared/models/upload-record';
import { PropertyRecord, TalhaoRecord, CropTypeRecord, EstadioRecord } from '@agrolens/contracts';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { OfflineUpload } from '../../shared/models/offline-upload';
import {
  canCorrectOfflineUpload,
  offlineErrorMessage,
  validateUploadImages,
} from '../../shared/utils/offline-errors';
import { withBrowserLock } from '../../shared/utils/browser-lock';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-upload-create-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
    MatDialogModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    PageHeaderComponent,
    LoadingStateComponent,
    LocationPickerComponent,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'pt-BR' }, provideNativeDateAdapter()],
  templateUrl: './upload-create-page.component.html',
  styleUrl: './upload-create-page.component.scss',
})
export class UploadCreatePageComponent implements OnInit {
  private readonly catalogCache = inject(OfflineCatalogCacheService);
  private readonly offlineUploadStore = inject(OfflineUploadStoreService);
  private readonly offlineUploadSync = inject(OfflineUploadSyncService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formUserId = this.authService.user()?.id;
  private editingUpload: OfflineUpload | null = null;
  readonly editing = signal(false);

  // Catalog state
  readonly properties = signal<PropertyRecord[]>([]);
  readonly filteredTalhoes = signal<TalhaoRecord[]>([]);
  readonly cropTypes = signal<CropTypeRecord[]>([]);
  readonly filteredEstadios = signal<EstadioRecord[]>([]);
  readonly loadingCatalogs = signal(true);
  readonly catalogsError = signal('');

  // Form state
  selectedPropertyId = '';
  selectedTalhaoId = '';
  selectedCropTypeId = '';
  selectedEstadioId = '';
  source: UploadSource = 'phone';
  readonly latitude = signal<number | null>(null);
  readonly longitude = signal<number | null>(null);
  readonly imageLocations = signal<Array<{ latitude: number | null; longitude: number | null }>>(
    [],
  );
  readonly locationTarget = signal<number | null>(null);
  readonly gpsPending = signal(false);
  private readonly initialActivityDate = new Date();
  activityDate: Date | null = this.initialActivityDate;
  activityTime = this.initialActivityDate.toTimeString().slice(0, 5);
  readonly files = signal<File[]>([]);
  readonly previewUrls = signal<string[]>([]);
  readonly missingLocationCount = computed(
    () =>
      this.files().filter((_, index) => {
        const location = this.imageLocations()[index];
        return location?.latitude == null || location?.longitude == null;
      }).length,
  );

  // Flow state
  readonly submitting = signal(false);
  readonly online = signal(navigator.onLine);
  readonly error = signal('');
  readonly progress = signal<{
    phase: string;
    message: string;
    filesUploaded: number;
    totalFiles: number;
    pollAttempts: number;
  } | null>(null);
  readonly completedUploadId = signal<string | null>(null);

  // All talhoes and estadios for client-side filtering
  private allTalhoes: TalhaoRecord[] = [];
  private allEstadios: EstadioRecord[] = [];

  async ngOnInit(): Promise<void> {
    const updateOnline = () => this.online.set(navigator.onLine);
    addEventListener('online', updateOnline);
    addEventListener('offline', updateOnline);
    this.destroyRef.onDestroy(() => {
      removeEventListener('online', updateOnline);
      removeEventListener('offline', updateOnline);
      this.revokePreviews();
    });
    await this.loadCatalogs();
    const localId = this.route.snapshot.queryParamMap.get('localId');
    if (localId) await this.restoreForCorrection(localId);
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const selectedFiles = Array.from(input.files);

    input.value = '';

    try {
      const contentTypes = validateUploadImages(selectedFiles);
      const newFiles = selectedFiles.map((file, index) =>
        file.type
          ? file
          : new File([file], file.name, {
              type: contentTypes[index],
              lastModified: file.lastModified,
            }),
      );
      const urls = newFiles.map((file) => URL.createObjectURL(file));
      const batchLocation =
        this.locationTarget() === null && this.latitude() !== null && this.longitude() !== null
          ? { latitude: this.latitude(), longitude: this.longitude() }
          : { latitude: null, longitude: null };
      this.files.update((current) => [...current, ...newFiles]);
      this.imageLocations.update((locations) => [
        ...locations,
        ...newFiles.map(() => ({ ...batchLocation })),
      ]);
      this.previewUrls.update((current) => [...current, ...urls]);
    } catch (error) {
      this.snackBar.open(offlineErrorMessage(error), 'Fechar', { duration: 8000 });
    }
  }

  removeFile(index: number): void {
    if (this.gpsPending()) return;
    URL.revokeObjectURL(this.previewUrls()[index]);
    this.previewUrls.update((urls) => urls.filter((_, i) => i !== index));
    this.files.update((f) => f.filter((_, i) => i !== index));
    this.imageLocations.update((locations) => locations.filter((_, i) => i !== index));
    if (this.locationTarget() === index) this.locationTarget.set(null);
    else if (this.locationTarget() !== null && this.locationTarget()! > index)
      this.locationTarget.update((target) => target! - 1);
  }

  onPropertyChange(): void {
    this.selectedTalhaoId = '';
    this.filteredTalhoes.set(
      this.selectedPropertyId
        ? this.allTalhoes.filter((t) => t.propertyId === this.selectedPropertyId)
        : [],
    );
  }

  onCropTypeChange(): void {
    this.selectedEstadioId = '';
    this.filteredEstadios.set(
      this.selectedCropTypeId
        ? this.allEstadios.filter((e) => e.cropTypeId === this.selectedCropTypeId)
        : [],
    );
  }

  onLocationSelected(location: { latitude: number; longitude: number }): void {
    this.latitude.set(location.latitude);
    this.longitude.set(location.longitude);
    const target = this.locationTarget();
    this.imageLocations.update((locations) =>
      locations.map((item, index) =>
        target === index || (target === null && (item.latitude === null || item.longitude === null))
          ? location
          : item,
      ),
    );
  }

  selectLocationTarget(index: number | null): void {
    if (this.gpsPending()) return;
    this.locationTarget.set(index);
    const point = index === null ? null : this.imageLocations()[index];
    this.latitude.set(point?.latitude ?? null);
    this.longitude.set(point?.longitude ?? null);
  }

  clearLocation(): void {
    if (this.gpsPending()) return;
    const target = this.locationTarget();
    this.latitude.set(null);
    this.longitude.set(null);
    this.imageLocations.update((locations) =>
      locations.map((item, index) =>
        target === null || target === index ? { latitude: null, longitude: null } : item,
      ),
    );
  }

  async onSubmit(): Promise<void> {
    if (
      this.submitting() ||
      this.files().length === 0 ||
      !this.selectedPropertyId ||
      !this.selectedTalhaoId ||
      !this.selectedCropTypeId
    ) {
      return;
    }

    const missing = this.missingLocationCount();
    if (missing > 0) {
      const accepted = await firstValueFrom(
        this.dialog
          .open(ConfirmDialogComponent, {
            data: {
              title: 'Imagens sem localização',
              message: `${missing} ${missing === 1 ? 'imagem está' : 'imagens estão'} sem coordenadas. Use Minha localização ou selecione um ponto no mapa antes de continuar, se possível. Deseja salvar sem localização mesmo assim?`,
              confirmText: 'Salvar sem localização',
              cancelText: 'Voltar e localizar',
            },
          })
          .afterClosed(),
      );
      if (!accepted) return;
    }

    if (!this.activityDate) {
      this.snackBar.open('Preencha a data da coleta.', 'Fechar', { duration: 6000 });
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.progress.set(null);
    this.completedUploadId.set(null);

    try {
      if (!this.formUserId || this.authService.user()?.id !== this.formUserId) {
        throw new Error('A conta mudou. Reabra o formulário com a conta que realizará a coleta.');
      }
      const contentTypes = validateUploadImages(this.files());
      if (
        !this.properties().some((p) => p.id === this.selectedPropertyId) ||
        !this.allTalhoes.some(
          (t) => t.id === this.selectedTalhaoId && t.propertyId === this.selectedPropertyId,
        ) ||
        !this.cropTypes().some((c) => c.id === this.selectedCropTypeId) ||
        (this.selectedEstadioId &&
          !this.allEstadios.some(
            (e) => e.id === this.selectedEstadioId && e.cropTypeId === this.selectedCropTypeId,
          ))
      ) {
        throw new Error('Selecione catálogos válidos para este lote.');
      }
      const [hours, minutes] = (this.activityTime || '00:00').split(':').map(Number);
      const activityDate = new Date(this.activityDate);
      activityDate.setHours(hours, minutes, 0, 0);

      const request: InitUploadRequest = {
        clientUploadId: crypto.randomUUID(),
        propertyId: this.selectedPropertyId,
        talhaoId: this.selectedTalhaoId,
        cropTypeId: this.selectedCropTypeId,
        estadioId: this.selectedEstadioId || undefined,
        source: this.source,
        activityDate: activityDate.toISOString(),
        files: this.files().map((f, index) => ({
          imageId: crypto.randomUUID(),
          contentType: contentTypes[index],
          sizeBytes: f.size,
          latitude: this.imageLocations()[index]?.latitude ?? null,
          longitude: this.imageLocations()[index]?.longitude ?? null,
        })),
      };

      const userId = this.authService.user()?.id;
      if (!userId) throw new Error('Sessão indisponível. Entre novamente para salvar o lote.');
      const timestamp = new Date().toISOString();
      const offlineUpload: OfflineUpload = {
        id: this.editingUpload?.id ?? crypto.randomUUID(),
        userId,
        request,
        files: this.files().map((file, index) => ({
          blob: file,
          fileName: file.name,
          contentType: contentTypes[index],
        })),
        status: 'pending',
        createdAt: this.editingUpload?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const save = async () => {
        if (this.editingUpload) {
          const current = await this.offlineUploadStore.get(this.editingUpload.id);
          if (
            !current ||
            !canCorrectOfflineUpload(current) ||
            current.userId !== userId ||
            current.updatedAt !== this.editingUpload.updatedAt
          ) {
            throw new Error('O lote mudou durante a edição. Reabra-o pela fila.');
          }
        }
        if (this.authService.user()?.id !== userId)
          throw new Error('A conta mudou durante o salvamento.');
        await this.offlineUploadStore.save(offlineUpload);
      };
      await withBrowserLock(`agrolens-upload:${offlineUpload.id}`, save);
      this.revokePreviews();
      this.files.set([]);
      this.imageLocations.set([]);

      if (navigator.onLine && !this.authService.reauthenticationRequired()) {
        const result = await this.offlineUploadSync.sync(offlineUpload, (p) => {
          this.progress.set({
            phase: p.phase,
            message: p.message,
            filesUploaded: p.filesUploaded,
            totalFiles: p.totalFiles,
            pollAttempts: p.pollAttempts,
          });
        });
        if (result.status === 'completed' && result.backendUploadId) {
          this.completedUploadId.set(result.backendUploadId);
          this.progress.set(null);
          this.snackBar.open('Upload criado com sucesso!', 'Fechar', { duration: 4000 });
          return;
        }
        this.snackBar.open(
          result.errorMessage || 'Lote salvo neste dispositivo. Sincronize-o na fila.',
          'Fechar',
          { duration: 6000 },
        );
        await this.router.navigate(['/uploads/queue']);
        return;
      }

      this.snackBar.open(
        'Lote salvo neste dispositivo. Sincronize-o quando estiver online.',
        'Fechar',
        {
          duration: 6000,
        },
      );
      await this.router.navigate(['/uploads/queue']);
    } catch (err: unknown) {
      const msg = offlineErrorMessage(err);
      this.error.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
      this.progress.set(null);
    } finally {
      this.submitting.set(false);
    }
  }

  async loadCatalogs(): Promise<void> {
    const cached = this.catalogCache.load();
    if (cached) this.applyCatalogs(cached);
    this.loadingCatalogs.set(!cached);
    this.catalogsError.set('');
    try {
      if (!navigator.onLine || this.authService.offlineSession()) {
        if (!cached)
          throw new Error(
            'Catálogos ainda não preparados. Conecte-se e use Preparar / atualizar offline antes de coletar.',
          );
        return;
      }
      const catalogs = await this.catalogCache.refresh();
      if (!this.destroyRef.destroyed && this.authService.user()?.id === this.formUserId)
        this.applyCatalogs(catalogs);
    } catch (err: unknown) {
      if (!cached) this.catalogsError.set(offlineErrorMessage(err));
    } finally {
      this.loadingCatalogs.set(false);
    }
  }

  private applyCatalogs(catalogs: OfflineCatalogs): void {
    this.properties.set(catalogs.properties);
    this.allTalhoes = catalogs.talhoes;
    this.cropTypes.set(catalogs.cropTypes);
    this.allEstadios = catalogs.estadios;
    this.filteredTalhoes.set(
      this.allTalhoes.filter((t) => t.propertyId === this.selectedPropertyId),
    );
    this.filteredEstadios.set(
      this.allEstadios.filter((e) => e.cropTypeId === this.selectedCropTypeId),
    );
  }

  private async restoreForCorrection(id: string): Promise<void> {
    try {
      const upload = await this.offlineUploadStore.get(id);
      if (!upload || upload.userId !== this.formUserId || !canCorrectOfflineUpload(upload)) {
        throw new Error('Este lote não está disponível para correção local.');
      }
      this.editingUpload = upload;
      this.editing.set(true);
      this.selectedPropertyId = upload.request.propertyId;
      this.onPropertyChange();
      this.selectedTalhaoId = upload.request.talhaoId;
      this.selectedCropTypeId = upload.request.cropTypeId;
      this.onCropTypeChange();
      this.selectedEstadioId = upload.request.estadioId ?? '';
      this.source = upload.request.source;
      this.activityDate = new Date(upload.request.activityDate);
      this.activityTime = this.activityDate.toTimeString().slice(0, 5);
      this.imageLocations.set(
        upload.request.files.map(({ latitude, longitude }) => ({
          latitude: latitude != null && longitude != null ? latitude : null,
          longitude: latitude != null && longitude != null ? longitude : null,
        })),
      );
      const files = upload.files.map(
        (file) => new File([file.blob], file.fileName, { type: file.contentType }),
      );
      this.files.set(files);
      this.previewUrls.set(files.map((file) => URL.createObjectURL(file)));
    } catch (error) {
      this.snackBar.open(offlineErrorMessage(error), 'Fechar', { duration: 8000 });
      await this.router.navigate(['/uploads/queue']);
    }
  }

  private revokePreviews(): void {
    this.previewUrls().forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls.set([]);
  }
}
