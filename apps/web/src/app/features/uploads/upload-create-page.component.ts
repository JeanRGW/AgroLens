import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
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

@Component({
  selector: 'app-upload-create-page',
  standalone: true,
  imports: [
    MatSnackBarModule,
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
  private readonly initialActivityDate = new Date();
  activityDate: Date | null = this.initialActivityDate;
  activityTime = this.initialActivityDate.toTimeString().slice(0, 5);
  readonly files = signal<File[]>([]);
  readonly previewUrls = signal<string[]>([]);

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
      this.files.update((current) => [...current, ...newFiles]);
      this.previewUrls.update((current) => [...current, ...urls]);
    } catch (error) {
      this.snackBar.open(offlineErrorMessage(error), 'Fechar', { duration: 8000 });
    }
  }

  removeFile(index: number): void {
    URL.revokeObjectURL(this.previewUrls()[index]);
    this.previewUrls.update((urls) => urls.filter((_, i) => i !== index));
    this.files.update((f) => f.filter((_, i) => i !== index));
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

    if (this.latitude() == null || this.longitude() == null) {
      this.snackBar.open('Obtenha a localização pelo GPS ou informe as coordenadas.', 'Fechar', {
        duration: 6000,
      });
      return;
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
        latitude: this.latitude()!,
        longitude: this.longitude()!,
        files: this.files().map((f, index) => ({
          fileName: f.name,
          contentType: contentTypes[index],
          sizeBytes: f.size,
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
      this.latitude.set(upload.request.latitude);
      this.longitude.set(upload.request.longitude);
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
