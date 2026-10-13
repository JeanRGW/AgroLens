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
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UploadCreateService } from '../../core/services/upload-create.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InitUploadRequest, UploadSource } from '../../shared/models/upload-record';
import {
  PropertyRecord,
  TalhaoRecord,
  CropTypeRecord,
  EstadioRecord,
  type LocationSource,
} from '@agrolens/contracts';
import { ImageMetadataService } from '../../core/services/image-metadata.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { uploadErrorMessage, validateUploadImages } from '../../shared/utils/upload-validation';
import { getLocationSourceLabel } from '../../shared/utils/upload-utils';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

interface ImageLocationPoint {
  latitude: number;
  longitude: number;
}
interface SelectedImage {
  file: File;
  previewUrl: string;
  location: ImageLocationPoint | null;
  locationSource: LocationSource;
  readingLocation: boolean;
  locationWarning?: boolean;
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
    MatTooltipModule,
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
  @ViewChild(LocationPickerComponent) locationPicker?: LocationPickerComponent;
  private readonly catalogsService = inject(CatalogsService);
  private readonly imageMetadata = inject(ImageMetadataService);
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
  readonly selectedImages = signal<SelectedImage[]>([]);
  readonly useGps = signal(true);
  readonly readingLocations = computed(() =>
    this.selectedImages().some((image) => image.readingLocation),
  );
  readonly locationSourceLabel = getLocationSourceLabel;
  readonly gpsPending = signal(false);
  readonly gpsError = signal('');
  readonly gpsTargets = signal<ReadonlySet<File>>(new Set());
  readonly mapSelection = signal<MapSelection | null>(null);
  readonly visibleMapSelection = computed<MapSelection | null>(
    () =>
      this.mapSelection() ??
      (this.useGps()
        ? null
        : {
            file: null,
            latitude: this.latitude(),
            longitude: this.longitude(),
            point: null,
          }),
  );
  readonly mapGpsPending = signal(false);
  readonly selectedMapImage = computed(() => {
    const file = this.mapSelection()?.file;
    return file ? this.selectedImages().find((image) => image.file === file) : undefined;
  });
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
  readonly files = computed(() => this.selectedImages().map((image) => image.file));
  readonly missingLocationCount = computed(
    () =>
      this.selectedImages().filter(
        (image) =>
          image.locationSource !== 'none' &&
          !image.readingLocation &&
          !image.location &&
          (!this.useGps() || !this.gpsTargets().has(image.file)),
      ).length,
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
      if (!navigator.onLine) this.cancelMap();
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

  onFilesSelected(event: Event, capture = false): void | Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    if (this.gpsPending() || this.submitting()) {
      input.value = '';
      return;
    }

    const selectedFiles = Array.from(input.files);

    input.value = '';

    try {
      const contentTypes = validateUploadImages(selectedFiles);
      const newFiles = selectedFiles.map((file, index) =>
        file.type === contentTypes[index]
          ? file
          : new File([file], file.name, {
              type: contentTypes[index],
              lastModified: file.lastModified,
            }),
      );
      const urls = newFiles.map((file) => URL.createObjectURL(file));
      this.selectedImages.update((images) => [
        ...images,
        ...newFiles.map((file, index) => ({
          file,
          previewUrl: urls[index],
          location: null,
          locationSource: 'file' as const,
          readingLocation: true,
        })),
      ]);
      return this.extractLocations(newFiles, capture);
    } catch (error) {
      this.snackBar.open(uploadErrorMessage(error), 'Fechar', { duration: 8000 });
    }
  }

  private async extractLocations(files: File[], capture: boolean): Promise<void> {
    for (const file of files) {
      const metadata = await this.imageMetadata.extract(file);
      if (this.destroyRef.destroyed) return;
      this.selectedImages.update((images) =>
        images.map((image) =>
          image.file === file
            ? {
                ...image,
                readingLocation: false,
                locationWarning: metadata.warnings.length > 0,
                location:
                  image.locationSource === 'file' && metadata.coordinates
                    ? {
                        latitude: metadata.coordinates.latitude,
                        longitude: metadata.coordinates.longitude,
                      }
                    : image.location,
              }
            : image,
        ),
      );
    }
    if (capture && this.useGps()) {
      const missing = this.selectedImages()
        .filter(
          (image) =>
            files.includes(image.file) && image.locationSource === 'file' && !image.location,
        )
        .map((image) => image.file);
      if (missing.length) this.requestGps(missing);
    }
  }

  removeFile(index: number): void {
    if (this.gpsPending() || this.submitting()) return;
    const removed = this.selectedImages()[index];
    if (!removed) return;
    URL.revokeObjectURL(removed.previewUrl);
    this.selectedImages.update((images) => images.filter((_, i) => i !== index));
    if (this.mapSelection()?.file === removed.file) this.cancelMap();
  }

  locationTooltip(image: SelectedImage): string {
    if (image.readingLocation) return 'Lendo localização do arquivo…';
    if (this.gpsTargets().has(image.file)) return 'Obtendo localização por GPS…';
    if (image.locationWarning && image.locationSource === 'file')
      return 'Metadados incompletos ou divergentes · Conferir no mapa';
    return image.location
      ? `${this.locationSourceLabel(image.locationSource)} · Ajustar no mapa`
      : 'Sem localização · Localizar';
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
    if (this.submitting() || (file && !this.files().includes(file))) return;
    this.latitude.set(location.latitude);
    this.longitude.set(location.longitude);
    this.selectedImages.update((images) =>
      images.map((image) =>
        (file ? image.file === file : image.locationSource !== 'none' && !image.location)
          ? { ...image, location, locationSource: 'manual' }
          : image,
      ),
    );
  }

  setUseGps(enabled: boolean): void {
    this.useGps.set(enabled);
    this.gpsError.set('');
    if (enabled) {
      this.cancelMap();
      return;
    }
    this.cancelGpsRequest();
  }

  applyCurrentLocation(): void {
    if (!this.useGps() || this.mapSelection() || this.readingLocations()) return;
    const missingFiles = this.selectedImages()
      .filter((image) => image.locationSource !== 'none' && !image.location)
      .map((image) => image.file);
    this.requestGps(missingFiles);
  }

  openMap(index: number | null = null): void {
    if (!this.online() || this.gpsPending() || this.mapSelection()) return;
    const image = index === null ? null : this.selectedImages()[index];
    const file = image?.file ?? null;
    if (index !== null && !file) return;
    this.locationPicker?.cancelLocationRequest();
    const point = image?.location;
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
    const selection = this.visibleMapSelection();
    if (selection) this.mapSelection.set({ ...selection, point });
  }

  cancelMap(): void {
    this.locationPicker?.cancelLocationRequest();
    this.mapSelection.set(null);
    this.mapGpsPending.set(false);
  }

  confirmMap(): void {
    const selection = this.mapSelection();
    if (!selection?.point || this.mapGpsPending()) return;
    this.onLocationSelected(selection.point, selection.file ?? undefined);
    this.cancelMap();
  }

  private requestGps(targetFiles: File[]): void {
    if (this.gpsPending() || !this.useGps() || !targetFiles.length) return;
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
        this.selectedImages.update((images) =>
          images.map((image) =>
            targets.has(image.file) && image.locationSource !== 'none' && !image.location
              ? { ...image, location: point, locationSource: 'device' }
              : image,
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
      this.readingLocations() ||
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
        files: this.selectedImages().map((image, index) => ({
          imageId: crypto.randomUUID(),
          contentType: contentTypes[index],
          sizeBytes: image.file.size,
          latitude: image.locationSource === 'file' ? null : (image.location?.latitude ?? null),
          longitude: image.locationSource === 'file' ? null : (image.location?.longitude ?? null),
          locationSource: image.locationSource,
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
        this.files(),
        (progress) => this.progress.set(progress),
        { userId, assertIdentity: () => this.authService.assertIdentity(userId) },
      );
      this.completedUploadId.set(result.id);
      this.progress.set(null);
      this.revokePreviews();
      this.selectedImages.set([]);
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
    this.selectedImages().forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }
}
