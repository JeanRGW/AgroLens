import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UploadCreateService } from '../../core/services/upload-create.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InitUploadRequest, UploadSource } from '../../shared/models/upload-record';
import { PropertyRecord, TalhaoRecord, CropTypeRecord, EstadioRecord } from '@agrolens/contracts';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { uploadErrorMessage, validateUploadImages } from '../../shared/utils/upload-validation';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface ImageLocationPoint {
  latitude: number;
  longitude: number;
}

interface MapSelection {
  file: File | null;
  latitude: number | null;
  longitude: number | null;
  point: ImageLocationPoint | null;
}

export function isMobileCameraDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  // Browsers cannot reliably report whether a file input opens native camera capture.
  return (
    /Android|iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

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
    MatSlideToggleModule,
    PageHeaderComponent,
    LoadingStateComponent,
    LocationPickerComponent,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'pt-BR' }, provideNativeDateAdapter()],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './upload-create-page.component.html',
  styleUrl: './upload-create-page.component.scss',
})
export class UploadCreatePageComponent implements OnInit {
  @ViewChild('locationSection') locationSection?: ElementRef<HTMLElement>;
  private readonly catalogsService = inject(CatalogsService);
  private readonly uploadCreateService = inject(UploadCreateService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formUserId = this.authService.user()?.id;

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
  readonly useGps = signal(true);
  readonly gpsPending = signal(false);
  readonly gpsError = signal('');
  readonly gpsTargets = signal<ReadonlySet<File>>(new Set());
  readonly mapSelection = signal<MapSelection | null>(null);
  readonly cameraCaptureAvailable = isMobileCameraDevice(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
  private gpsRequest = 0;
  private gpsTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly initialActivityDate = new Date();
  activityDate: Date | null = this.initialActivityDate;
  activityTime = this.initialActivityDate.toTimeString().slice(0, 5);
  readonly files = signal<File[]>([]);
  readonly previewUrls = signal<string[]>([]);
  readonly missingLocationCount = computed(
    () =>
      this.files().filter((file, index) => {
        const location = this.imageLocations()[index];
        return (
          (location?.latitude == null || location?.longitude == null) &&
          (!this.useGps() || !this.gpsTargets().has(file))
        );
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
  private pendingRequest: InitUploadRequest | null = null;
  private pendingFiles: File[] | null = null;

  // All talhoes and estadios for client-side filtering
  private allTalhoes: TalhaoRecord[] = [];
  private allEstadios: EstadioRecord[] = [];

  async canDeactivate(): Promise<boolean> {
    if (this.submitting()) return false;
    if (!this.files().length) return true;
    return !!(await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Descartar upload?',
            message: 'As imagens selecionadas ainda não foram enviadas. Deseja sair sem enviar?',
            confirmText: 'Descartar e sair',
            cancelText: 'Continuar edição',
          },
        })
        .afterClosed(),
    ));
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.files().length || this.submitting()) event.preventDefault();
  }

  async ngOnInit(): Promise<void> {
    const updateOnline = () => {
      this.online.set(navigator.onLine);
      if (!navigator.onLine) this.mapSelection.set(null);
    };
    addEventListener('online', updateOnline);
    addEventListener('offline', updateOnline);
    this.destroyRef.onDestroy(() => {
      removeEventListener('online', updateOnline);
      removeEventListener('offline', updateOnline);
      this.cancelGpsRequest();
      this.revokePreviews();
    });
    await this.loadCatalogs();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    if (this.gpsPending()) {
      input.value = '';
      return;
    }

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
      this.imageLocations.update((locations) => [
        ...locations,
        ...newFiles.map(() => ({ latitude: null, longitude: null })),
      ]);
      this.previewUrls.update((current) => [...current, ...urls]);
      if (this.useGps()) this.requestGps(newFiles);
    } catch (error) {
      this.snackBar.open(uploadErrorMessage(error), 'Fechar', { duration: 8000 });
    }
  }

  removeFile(index: number): void {
    if (this.gpsPending()) return;
    const removedFile = this.files()[index];
    URL.revokeObjectURL(this.previewUrls()[index]);
    this.previewUrls.update((urls) => urls.filter((_, i) => i !== index));
    this.files.update((f) => f.filter((_, i) => i !== index));
    this.imageLocations.update((locations) => locations.filter((_, i) => i !== index));
    if (this.mapSelection()?.file === removedFile) this.cancelMap();
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

  onLocationSelected(location: ImageLocationPoint, file?: File): void {
    const target = file ? this.files().indexOf(file) : null;
    if (target === -1) return;
    this.latitude.set(location.latitude);
    this.longitude.set(location.longitude);
    this.imageLocations.update((locations) =>
      locations.map((item, index) =>
        target === index || (target === null && (item.latitude === null || item.longitude === null))
          ? location
          : item,
      ),
    );
  }

  setUseGps(enabled: boolean): void {
    this.useGps.set(enabled);
    this.gpsError.set('');
    if (enabled) {
      this.mapSelection.set(null);
      return;
    }
    this.cancelGpsRequest();
    if (this.online() && !this.mapSelection()) this.openMap();
  }

  applyCurrentLocation(): void {
    if (!this.useGps() || this.mapSelection()) return;
    const missingFiles = this.files().filter((_, index) => {
      const location = this.imageLocations()[index];
      return location?.latitude == null || location?.longitude == null;
    });
    this.requestGps(missingFiles);
  }

  openMap(index: number | null = null): void {
    if (!this.online() || this.gpsPending() || this.mapSelection()) return;
    const file = index === null ? null : this.files()[index];
    if (index !== null && !file) return;
    const point = index === null ? null : this.imageLocations()[index];
    const latitude = file ? (point?.latitude ?? null) : this.latitude();
    const longitude = file ? (point?.longitude ?? null) : this.longitude();
    this.mapSelection.set({
      file,
      latitude,
      longitude,
      point: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    });
    if (index !== null && window.matchMedia('(max-width: 900px)').matches) {
      this.locationSection?.nativeElement.scrollIntoView({ block: 'start' });
    }
  }

  onMapDraftSelected(point: ImageLocationPoint): void {
    this.mapSelection.update((selection) => (selection ? { ...selection, point } : null));
  }

  cancelMap(): void {
    this.mapSelection.set(null);
  }

  confirmMap(): void {
    const selection = this.mapSelection();
    if (!selection?.point) return;
    this.onLocationSelected(selection.point, selection.file ?? undefined);
    this.mapSelection.set(null);
  }

  private requestGps(targetFiles: File[]): void {
    if (this.gpsPending() || !this.useGps()) return;
    this.gpsError.set('');
    if (!navigator.geolocation) {
      this.gpsError.set('GPS indisponível. Abra o aplicativo em HTTPS e ative a localização.');
      return;
    }

    const request = ++this.gpsRequest;
    const targets = new Set(targetFiles);
    this.gpsTargets.set(targets);
    this.gpsPending.set(true);
    const finish = (point: ImageLocationPoint | null, message = '') => {
      if (this.destroyRef.destroyed || request !== this.gpsRequest) return;
      this.gpsRequest++;
      if (this.gpsTimer) clearTimeout(this.gpsTimer);
      this.gpsTimer = null;
      if (point) {
        this.latitude.set(point.latitude);
        this.longitude.set(point.longitude);
        this.imageLocations.update((locations) =>
          locations.map((item, index) =>
            targets.has(this.files()[index]) && (item.latitude === null || item.longitude === null)
              ? point
              : item,
          ),
        );
      } else {
        this.gpsError.set(message);
      }
      this.gpsTargets.set(new Set());
      this.gpsPending.set(false);
    };
    this.gpsTimer = setTimeout(
      () => finish(null, 'O GPS demorou demais. Vá para uma área aberta e tente novamente.'),
      25000,
    );
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            finish(null, 'O dispositivo retornou uma localização inválida. Tente novamente.');
            return;
          }
          finish({ latitude, longitude });
        },
        (error) =>
          finish(
            null,
            error.code === 1
              ? 'Permita o acesso à localização nas configurações do navegador e tente novamente.'
              : error.code === 3
                ? 'O GPS demorou demais. Vá para uma área aberta e tente novamente.'
                : 'Localização indisponível. Verifique o GPS e tente novamente.',
          ),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    } catch {
      finish(null, 'Não foi possível obter sua localização atual.');
    }
  }

  private cancelGpsRequest(): void {
    this.gpsRequest++;
    if (this.gpsTimer) clearTimeout(this.gpsTimer);
    this.gpsTimer = null;
    this.gpsTargets.set(new Set());
    this.gpsPending.set(false);
  }

  async onSubmit(): Promise<void> {
    if (
      this.submitting() ||
      !this.online() ||
      this.gpsPending() ||
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
              message: `${missing} ${missing === 1 ? 'imagem está' : 'imagens estão'} sem coordenadas. Use o GPS ou selecione um ponto no mapa, se possível. Deseja enviar sem localização mesmo assim?`,
              confirmText: 'Enviar sem localização',
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

      // Keep retry identity in memory only, and replace it when the form changes.
      const sameFiles =
        this.pendingFiles?.length === this.files().length &&
        this.pendingFiles.every((file, index) => file === this.files()[index]);
      const metadata = (value: InitUploadRequest) =>
        JSON.stringify({
          ...value,
          clientUploadId: undefined,
          files: value.files.map((file) => ({ ...file, imageId: undefined })),
        });
      if (
        !this.pendingRequest ||
        !sameFiles ||
        metadata(this.pendingRequest) !== metadata(request)
      ) {
        this.pendingRequest = request;
        this.pendingFiles = [...this.files()];
      }
      const userId = this.formUserId;
      const result = await this.uploadCreateService.createUpload(
        this.pendingRequest,
        this.files().map((file, index) =>
          file.type ? file : new File([file], file.name, { type: contentTypes[index] }),
        ),
        (progress) => this.progress.set(progress),
        { userId, assertIdentity: () => this.authService.assertIdentity(userId) },
      );
      this.completedUploadId.set(result.id);
      this.progress.set(null);
      this.revokePreviews();
      this.files.set([]);
      this.imageLocations.set([]);
      this.pendingRequest = null;
      this.pendingFiles = null;
      this.snackBar.open('Upload criado com sucesso!', 'Fechar', { duration: 4000 });
    } catch (err: unknown) {
      const msg = uploadErrorMessage(err);
      this.error.set(msg);
      this.snackBar.open(msg, 'Fechar', { duration: 6000 });
      this.progress.set(null);
    } finally {
      this.submitting.set(false);
    }
  }

  async loadCatalogs(): Promise<void> {
    this.loadingCatalogs.set(true);
    this.catalogsError.set('');
    try {
      const [properties, talhoes, cropTypes, estadios] = await Promise.all([
        this.catalogsService.listProperties(),
        this.catalogsService.listTalhoes(),
        this.catalogsService.listCropTypes(),
        this.catalogsService.listEstadios(),
      ]);
      if (this.destroyRef.destroyed || this.authService.user()?.id !== this.formUserId) return;
      this.properties.set(properties);
      this.allTalhoes = talhoes;
      this.cropTypes.set(cropTypes);
      this.allEstadios = estadios;
      this.filteredTalhoes.set(talhoes.filter((t) => t.propertyId === this.selectedPropertyId));
      this.filteredEstadios.set(estadios.filter((e) => e.cropTypeId === this.selectedCropTypeId));
    } catch (err: unknown) {
      this.catalogsError.set(uploadErrorMessage(err));
    } finally {
      this.loadingCatalogs.set(false);
    }
  }

  private revokePreviews(): void {
    this.previewUrls().forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls.set([]);
  }
}
