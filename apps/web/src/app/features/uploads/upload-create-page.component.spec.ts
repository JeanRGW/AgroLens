import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  OfflineCatalogCacheService,
  OfflineCatalogs,
} from '../../core/services/offline-catalog-cache.service';
import { OfflineUploadStoreService } from '../../core/services/offline-upload-store.service';
import { OfflineUploadSyncService } from '../../core/services/offline-upload-sync.service';
import { isMobileCameraDevice, UploadCreatePageComponent } from './upload-create-page.component';
import { OfflineUpload } from '../../shared/models/offline-upload';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';

const catalogs: OfflineCatalogs = {
  properties: [
    {
      id: 'p',
      name: 'Farm',
      owner: 'Owner',
      userId: 'u',
      address: '',
      latitude: 1,
      longitude: 2,
      createdAt: '',
    },
  ],
  talhoes: [{ id: 't', name: 'Field', propertyId: 'p', userId: 'u', createdAt: '' }],
  cropTypes: [{ id: 'c', name: 'Crop', userId: 'u', createdAt: '' }],
  estadios: [{ id: 'e', name: 'Stage', cropTypeId: 'c', userId: 'u', createdAt: '' }],
};

describe('UploadCreatePageComponent offline collection', () => {
  let fixture: ComponentFixture<UploadCreatePageComponent>;
  let component: UploadCreatePageComponent;
  let cache: jasmine.SpyObj<OfflineCatalogCacheService>;
  let store: jasmine.SpyObj<OfflineUploadStoreService>;
  let sync: jasmine.SpyObj<OfflineUploadSyncService>;
  let online: jasmine.Spy;
  const offlineSession = signal(true);
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } };

  beforeEach(async () => {
    online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    offlineSession.set(true);
    route.snapshot.queryParamMap = convertToParamMap({});
    cache = jasmine.createSpyObj('OfflineCatalogCacheService', ['load', 'refresh']);
    cache.load.and.returnValue(catalogs);
    cache.refresh.and.resolveTo(catalogs);
    store = jasmine.createSpyObj('OfflineUploadStoreService', ['save', 'get']);
    store.save.and.resolveTo();
    sync = jasmine.createSpyObj('OfflineUploadSyncService', ['sync']);
    await TestBed.configureTestingModule({
      imports: [UploadCreatePageComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 'u' }),
            offlineSession,
            reauthenticationRequired: () => false,
          },
        },
        { provide: OfflineCatalogCacheService, useValue: cache },
        { provide: OfflineUploadStoreService, useValue: store },
        { provide: OfflineUploadSyncService, useValue: sync },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: route,
        },
      ],
    }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(UploadCreatePageComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    component.selectedPropertyId = 'p';
    component.onPropertyChange();
    component.selectedTalhaoId = 't';
    component.selectedCropTypeId = 'c';
    component.onCropTypeChange();
    component.selectedEstadioId = 'e';
    component.setUseGps(false);
    component.onFilesSelected({
      target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
  });

  it('saves blobs, the last identity, GPS and all catalog IDs without a network call', async () => {
    await component.onSubmit();
    const batch = store.save.calls.mostRecent().args[0];
    expect(batch.userId).toBe('u');
    expect(batch.request).toEqual(
      jasmine.objectContaining({
        propertyId: 'p',
        talhaoId: 't',
        cropTypeId: 'c',
        estadioId: 'e',
        files: [jasmine.objectContaining({ latitude: -25.4, longitude: -51.4 })],
      }),
    );
    expect(await batch.files[0].blob.text()).toBe('image');
    expect(batch.request.clientUploadId).toBeTruthy();
    expect(cache.refresh).not.toHaveBeenCalled();
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it('confirms route changes when an image is selected and keeps it on cancel', async () => {
    const dialog = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(false),
    } as never);
    expect(await component.canDeactivate()).toBeFalse();
    expect(dialog).toHaveBeenCalledWith(
      jasmine.anything(),
      jasmine.objectContaining({
        data: jasmine.objectContaining({
          confirmText: 'Descartar e sair',
          cancelText: 'Continuar edição',
        }),
      }),
    );
    expect(component.files().length).toBe(1);

    dialog.and.returnValue({ afterClosed: () => of(true) } as never);
    expect(await component.canDeactivate()).toBeTrue();
  });

  it('allows leaving without confirmation when all images are removed or saved', async () => {
    const dialog = spyOn(component['dialog'], 'open');
    component.removeFile(0);
    expect(await component.canDeactivate()).toBeTrue();
    expect(dialog).not.toHaveBeenCalled();

    component.onFilesSelected({
      target: { files: [new File(['image'], 'another.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
    const navigate = TestBed.inject(Router).navigate as jasmine.Spy;
    navigate.and.callFake(async () => {
      expect(component.submitting()).toBeTrue();
      expect(await component.canDeactivate()).toBeTrue();
      const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      component.onBeforeUnload(unload);
      expect(unload.defaultPrevented).toBeFalse();
      return true;
    });
    await component.onSubmit();
    expect(store.save).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/uploads/queue']);
    expect(await component.canDeactivate()).toBeTrue();
    expect(dialog).not.toHaveBeenCalled();
  });

  it('blocks navigation during persistence and keeps failed saves protected', async () => {
    let rejectSave!: (reason: Error) => void;
    store.save.and.returnValue(new Promise<void>((_, reject) => (rejectSave = reject)));
    const dialog = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(false),
    } as never);
    const saving = component.onSubmit();
    expect(component.submitting()).toBeTrue();
    expect(await component.canDeactivate()).toBeFalse();
    expect(dialog).not.toHaveBeenCalled();

    rejectSave(new DOMException('Full', 'QuotaExceededError'));
    await saving;
    expect(component.files().length).toBe(1);
    expect(await component.canDeactivate()).toBeFalse();
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  it('warns before a tab refresh only when images are unsaved or a save is in progress', () => {
    const unload = () => new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const withImages = unload();
    component.onBeforeUnload(withImages);
    expect(withImages.defaultPrevented).toBeTrue();

    component.removeFile(0);
    const empty = unload();
    component.onBeforeUnload(empty);
    expect(empty.defaultPrevented).toBeFalse();

    component.submitting.set(true);
    const saving = unload();
    component.onBeforeUnload(saving);
    expect(saving.defaultPrevented).toBeTrue();
  });

  it('does not overwrite an individual image point when applying a batch location', () => {
    const firstFile = component.files()[0];
    component.onLocationSelected({ latitude: -21, longitude: -42 }, firstFile);
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.jpg', { type: 'image/jpeg' })], value: '' },
    } as unknown as Event);
    expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
    expect(component.missingLocationCount()).toBe(1);
    component.onLocationSelected({ latitude: -20, longitude: -41 });
    expect(component.imageLocations()).toEqual([
      { latitude: -21, longitude: -42 },
      { latitude: -20, longitude: -41 },
    ]);
  });

  it('does not reuse an earlier batch point for newly added images', () => {
    component.removeFile(0);
    component.onLocationSelected({ latitude: -22, longitude: -43 });
    component.onFilesSelected({
      target: { files: [new File(['photo'], 'new.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);

    expect(component.imageLocations()).toEqual([{ latitude: null, longitude: null }]);
    expect(component.missingLocationCount()).toBe(1);
  });

  it('shows one location action per mode without manual coordinate fields', () => {
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const action = () => page.querySelector<HTMLButtonElement>('.upload-create__location-action');
    expect(action()?.textContent).toContain('Selecionar no mapa');
    expect(action()?.disabled).toBeTrue();
    expect(page.querySelector('input[name="manualLat"]')).toBeNull();
    expect(page.querySelector('input[name="manualLng"]')).toBeNull();

    component.setUseGps(true);
    fixture.detectChanges();
    expect(action()?.textContent).toContain('Aplicar localização atual');
    expect(action()?.disabled).toBeFalse();
  });

  it('hides camera capture on desktop and keeps the gallery picker', () => {
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const galleryInput = page.querySelector<HTMLInputElement>('.gallery-input')!;
    expect(page.querySelector('.camera-input')).toBeNull();
    expect(page.querySelector('.camera-button')).toBeNull();
    expect(galleryInput.multiple).toBeTrue();
    expect(galleryInput.hasAttribute('capture')).toBeFalse();

    const openGallery = spyOn(galleryInput, 'click');
    page.querySelector<HTMLButtonElement>('.gallery-button')!.click();
    expect(openGallery).toHaveBeenCalledTimes(1);
  });

  it('shows native camera capture on a supported mobile device', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(
      'Mozilla/5.0 (Linux; Android 15) Mobile',
    );
    const mobileFixture = TestBed.createComponent(UploadCreatePageComponent);
    const mobileComponent = mobileFixture.componentInstance;
    await mobileComponent.ngOnInit();
    mobileComponent.setUseGps(false);
    mobileFixture.detectChanges();
    const page: HTMLElement = mobileFixture.nativeElement;
    const cameraInput = page.querySelector<HTMLInputElement>('.camera-input')!;
    const galleryInput = page.querySelector<HTMLInputElement>('.gallery-input')!;
    expect(cameraInput).not.toBeNull();
    expect(cameraInput.getAttribute('capture')).toBe('environment');
    expect(cameraInput.multiple).toBeFalse();
    expect(galleryInput.multiple).toBeTrue();
    expect(galleryInput.hasAttribute('capture')).toBeFalse();

    const openCamera = spyOn(cameraInput, 'click');
    page.querySelector<HTMLButtonElement>('.camera-button')!.click();
    expect(openCamera).toHaveBeenCalledTimes(1);

    const capture = new DataTransfer();
    capture.items.add(new File(['camera'], 'capture.jpg', { type: 'image/jpeg' }));
    cameraInput.files = capture.files;
    cameraInput.dispatchEvent(new Event('change'));
    expect(mobileComponent.files().map((file) => file.name)).toEqual(['capture.jpg']);
    expect(mobileComponent.imageLocations()[0]).toEqual({ latitude: null, longitude: null });
  });

  it('shows camera capture only on recognized mobile platforms', () => {
    expect(isMobileCameraDevice('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0)).toBeFalse();
    expect(isMobileCameraDevice('Mozilla/5.0 (Linux; Android 15)', 'Linux', 5)).toBeTrue();
    expect(isMobileCameraDevice('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBeTrue();
    expect(isMobileCameraDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBeTrue();
    expect(isMobileCameraDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBeFalse();
  });

  it('waits for fresh GPS on newly selected images before showing their warning', () => {
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(geolocation).toHaveBeenCalledTimes(1);
    expect(geolocation.calls.mostRecent().args[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    expect(component.gpsPending()).toBeTrue();
    expect(component.missingLocationCount()).toBe(0);
    expect(page.querySelectorAll('.location-warning').length).toBe(0);
    expect(page.querySelectorAll('.image-location')[1].textContent).toContain('Localizando...');
    expect(page.querySelector<HTMLButtonElement>('.file-input-area button')!.disabled).toBeTrue();
    expect(
      page.querySelector<HTMLButtonElement>('.upload-create__actions button')!.disabled,
    ).toBeTrue();
    component.removeFile(0);
    expect(component.files().length).toBe(2);

    const onSuccess = geolocation.calls.mostRecent().args[0] as PositionCallback;
    onSuccess({ coords: { latitude: -20, longitude: -41, accuracy: 5 } } as GeolocationPosition);
    fixture.detectChanges();
    expect(component.imageLocations()).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -20, longitude: -41 },
    ]);
    expect(component.gpsPending()).toBeFalse();
    expect(component.missingLocationCount()).toBe(0);
    expect(fixture.nativeElement.querySelector('.image-location.missing')).toBeNull();
  });

  it('shows the warning after GPS fails and lets an explicit retry fill missing images', () => {
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    const onFailure = geolocation.calls.mostRecent().args[1] as PositionErrorCallback;
    onFailure({ code: 1 } as GeolocationPositionError);
    fixture.detectChanges();

    expect(component.missingLocationCount()).toBe(1);
    expect(component.gpsError()).toContain('Permita');
    expect(fixture.nativeElement.querySelector('.location-warning')).not.toBeNull();
    component.applyCurrentLocation();
    const onSuccess = geolocation.calls.mostRecent().args[0] as PositionCallback;
    onSuccess({ coords: { latitude: -22, longitude: -43 } } as GeolocationPosition);
    expect(component.imageLocations()).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -22, longitude: -43 },
    ]);
  });

  it('keeps older unlocated images in the warning while a new image is locating', () => {
    component.imageLocations.set([{ latitude: null, longitude: null }]);
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);

    expect(component.missingLocationCount()).toBe(1);
    const onSuccess = geolocation.calls.mostRecent().args[0] as PositionCallback;
    onSuccess({ coords: { latitude: -22, longitude: -43 } } as GeolocationPosition);
    expect(component.imageLocations()).toEqual([
      { latitude: null, longitude: null },
      { latitude: -22, longitude: -43 },
    ]);
    expect(component.missingLocationCount()).toBe(1);
  });

  it('ignores an in-flight GPS fix after automatic location is turned off', () => {
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    const onSuccess = geolocation.calls.mostRecent().args[0] as PositionCallback;
    component.online.set(true);
    component.setUseGps(false);
    onSuccess({ coords: { latitude: -22, longitude: -43 } } as GeolocationPosition);

    expect(component.gpsPending()).toBeFalse();
    expect(component.mapSelection()).not.toBeNull();
    expect(component.missingLocationCount()).toBe(1);
    expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
    component.onFilesSelected({
      target: { files: [new File(['third'], 'third.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    expect(geolocation).toHaveBeenCalledTimes(1);
  });

  it('shows the map inline and applies only confirmed points to the intended images', () => {
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    component.online.set(true);
    component.latitude.set(null);
    component.longitude.set(null);
    const dialog = spyOn(component['dialog'], 'open');

    component.openMap();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const confirm = () =>
      page.querySelector<HTMLButtonElement>('.upload-create__map-actions button:last-child')!;
    const picker = () =>
      fixture.debugElement.query(By.directive(LocationPickerComponent))
        .componentInstance as LocationPickerComponent;
    expect(page.querySelector('.upload-create__location app-location-picker')).not.toBeNull();
    expect(confirm().disabled).toBeTrue();
    picker().locationSelected.emit({ latitude: -20, longitude: -41 });
    fixture.detectChanges();
    expect(confirm().disabled).toBeFalse();
    expect(component.missingLocationCount()).toBe(1);
    component.cancelMap();
    fixture.detectChanges();
    expect(page.querySelector('app-location-picker')).toBeNull();
    expect(component.missingLocationCount()).toBe(1);

    component.openMap();
    fixture.detectChanges();
    picker().locationSelected.emit({ latitude: -20, longitude: -41 });
    component.confirmMap();
    fixture.detectChanges();
    expect(component.imageLocations()).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -20, longitude: -41 },
    ]);

    component.openMap(0);
    fixture.detectChanges();
    expect(component.mapSelection()?.file).toBe(component.files()[0]);
    expect(confirm().disabled).toBeFalse();
    picker().locationSelected.emit({ latitude: -21, longitude: -42 });
    component.confirmMap();
    expect(component.imageLocations()).toEqual([
      { latitude: -21, longitude: -42 },
      { latitude: -20, longitude: -41 },
    ]);
    expect(dialog).not.toHaveBeenCalled();
  });

  it('closes an unconfirmed inline map when switching modes', () => {
    component.online.set(true);
    fixture.detectChanges();
    component.openMap(0);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.upload-create__map-panel')).not.toBeNull();
    expect(page.querySelector<HTMLButtonElement>('.file-input-area button')!.disabled).toBeFalse();
    expect(
      page.querySelector<HTMLButtonElement>('.upload-create__actions button')!.disabled,
    ).toBeFalse();

    component.setUseGps(true);
    fixture.detectChanges();
    expect(component.mapSelection()).toBeNull();
    expect(page.querySelector('.upload-create__map-panel')).toBeNull();
    expect(component.imageLocations()[0]).toEqual({ latitude: -25.4, longitude: -51.4 });
  });

  it('opens the inline map on GPS opt-out and keeps image selection available', () => {
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.online.set(true);
    component.setUseGps(true);
    fixture.detectChanges();
    expect(component.mapSelection()).toBeNull();

    component.setUseGps(false);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.upload-create__location app-location-picker')).not.toBeNull();
    expect(page.querySelector('.upload-create__location-action')?.textContent).toContain(
      'Ocultar mapa',
    );
    expect(page.querySelector<HTMLButtonElement>('.file-input-area button')!.disabled).toBeFalse();

    const mapButton = () =>
      page.querySelector<HTMLButtonElement>('.upload-create__location-action')!;
    mapButton().click();
    fixture.detectChanges();
    expect(component.mapSelection()).toBeNull();
    expect(mapButton().textContent).toContain('Selecionar no mapa');
    mapButton().click();
    fixture.detectChanges();
    expect(component.mapSelection()).not.toBeNull();

    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    expect(geolocation).not.toHaveBeenCalled();
    expect(component.missingLocationCount()).toBe(1);
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    component.confirmMap();
    expect(component.imageLocations()).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -20, longitude: -41 },
    ]);
  });

  it('confirms and persists locationless images as an explicit null pair', async () => {
    component.imageLocations.set([{ latitude: null, longitude: null }]);
    component.online.set(true);
    component.openMap();
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    const confirm = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(true),
    } as never);
    await component.onSubmit();
    expect(confirm).toHaveBeenCalled();
    expect(store.save.calls.mostRecent().args[0].request.files[0]).toEqual(
      jasmine.objectContaining({ latitude: null, longitude: null }),
    );
  });

  it('shows only the completion card after an online upload becomes ready', async () => {
    online.and.returnValue(true);
    offlineSession.set(false);
    sync.sync.and.callFake(async (upload, onProgress) => {
      for (const phase of ['uploading', 'finalizing', 'ready'] as const) {
        onProgress?.({
          phase,
          message: phase === 'ready' ? 'Upload concluído!' : 'Enviando...',
          filesUploaded: 1,
          totalFiles: 1,
          pollAttempts: 1,
        });
      }
      return { ...upload, status: 'completed', backendUploadId: 'server-1' };
    });

    await component.onSubmit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelectorAll('.completion-card').length).toBe(1);
    expect(page.querySelector('.progress-card')).toBeNull();
    expect(page.querySelector('mat-progress-bar')).toBeNull();
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.upload-create__actions')).toBeNull();
    expect(page.textContent).not.toContain('Recarregar catálogos');
    expect(page.querySelector('.completion-card p')?.textContent).toContain(
      'O upload foi concluído e já está disponível para visualização.',
    );
    expect(page.querySelector('.completion-card a')?.getAttribute('href')).toBe(
      '/uploads/server-1',
    );
  });

  it('retains the selected images when IndexedDB cannot commit the batch', async () => {
    store.save.and.rejectWith(new DOMException('Full', 'QuotaExceededError'));
    await component.onSubmit();
    expect(component.files().length).toBe(1);
    expect(component.error()).toContain('Armazenamento cheio');
  });

  it('renders saved catalogs immediately while a network refresh is pending', async () => {
    online.and.returnValue(true);
    offlineSession.set(false);
    let resolve!: (value: OfflineCatalogs) => void;
    cache.refresh.and.returnValue(new Promise((done) => (resolve = done)));
    const loading = component.loadCatalogs();
    expect(component.loadingCatalogs()).toBeFalse();
    expect(component.properties()).toEqual(catalogs.properties);
    resolve(catalogs);
    await loading;
  });

  it('rejects unsupported phone image types before saving them', async () => {
    component.files.set([new File(['heic'], 'photo.heic', { type: 'image/heic' })]);
    await component.onSubmit();
    expect(store.save).not.toHaveBeenCalled();
    expect(component.error()).toContain('HEIC');
    expect(component.files().length).toBe(1);
  });

  it('reloads catalogs after reconnect without discarding photos or collection metadata', async () => {
    const files = component.files();
    const updated = {
      ...catalogs,
      talhoes: [{ ...catalogs.talhoes[0], id: 'replacement', name: 'Replacement field' }],
    };
    online.and.returnValue(true);
    offlineSession.set(false);
    cache.refresh.and.resolveTo(updated);

    await component.loadCatalogs();

    expect(component.filteredTalhoes()).toEqual(updated.talhoes);
    expect(component.files()).toBe(files);
    expect(component.selectedPropertyId).toBe('p');
    expect(component.selectedEstadioId).toBe('e');
    expect(component.latitude()).toBe(-25.4);
    expect(component.longitude()).toBe(-51.4);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('accepts an untyped camera JPEG alongside other images and persists its resolved type', async () => {
    const capture = new File(['camera bytes'], 'capture.JPG', { lastModified: 123456789 });
    const png = new File(['png bytes'], 'typed.png', { type: 'image/png' });
    component.onFilesSelected({ target: { files: [capture, png], value: '' } } as unknown as Event);

    expect(capture.type).toBe('');
    expect(component.files().length).toBe(3);
    const normalized = component.files()[1];
    expect(normalized.type).toBe('image/jpeg');
    expect(normalized.name).toBe(capture.name);
    expect(normalized.lastModified).toBe(capture.lastModified);
    expect(await normalized.text()).toBe('camera bytes');
    expect(component.missingLocationCount()).toBe(2);
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });

    await component.onSubmit();

    const saved = store.save.calls.mostRecent().args[0];
    expect(saved.request.files.map((file) => file.contentType)).toEqual([
      'image/png',
      'image/jpeg',
      'image/png',
    ]);
    expect(saved.files[1].contentType).toBe('image/jpeg');
    expect(saved.files[1].blob.type).toBe('image/jpeg');
    expect(await saved.files[1].blob.text()).toBe('camera bytes');
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it('infers untyped PNG and WebP metadata at save time rather than defaulting to JPEG', async () => {
    component.files.set([
      new File(['png bytes'], 'capture.PNG'),
      new File(['webp bytes'], 'capture.webp'),
    ]);
    component.imageLocations.set([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -25.4, longitude: -51.4 },
    ]);

    await component.onSubmit();

    const saved = store.save.calls.mostRecent().args[0];
    expect(saved.request.files.map((file) => file.contentType)).toEqual([
      'image/png',
      'image/webp',
    ]);
    expect(saved.files.map((file) => file.contentType)).toEqual(['image/png', 'image/webp']);
  });

  describe('correcting an initialized validation failure', () => {
    let failed: OfflineUpload;

    beforeEach(async () => {
      const files = [
        new File(['invalid image'], 'bad.png', { type: 'image/png' }),
        new File(['keep this image'], 'keep.png', { type: 'image/png' }),
      ];
      failed = {
        id: 'local-1',
        userId: 'u',
        backendUploadId: 'server-1',
        status: 'failed',
        failureKind: 'validation',
        errorMessage: 'Original object exceeds maximum size',
        attempts: 1,
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:01:00Z',
        request: {
          clientUploadId: 'old-client-id',
          propertyId: 'p',
          talhaoId: 't',
          cropTypeId: 'c',
          estadioId: 'e',
          source: 'phone',
          activityDate: '2026-09-01T11:00:00Z',
          files: files.map((file) => ({
            imageId: crypto.randomUUID(),
            contentType: file.type,
            sizeBytes: file.size,
            latitude: -25.4,
            longitude: -51.4,
          })),
        },
        files: files.map((file) => ({ blob: file, fileName: file.name, contentType: file.type })),
      };
      store.get.and.resolveTo(failed);
      route.snapshot.queryParamMap = convertToParamMap({
        localId: failed.id,
      });
      component = TestBed.createComponent(UploadCreatePageComponent).componentInstance;
      await component.ngOnInit();
      component.setUseGps(false);
    });

    it('warns before leaving a batch restored for correction', async () => {
      const dialog = spyOn(component['dialog'], 'open').and.returnValue({
        afterClosed: () => of(false),
      } as never);
      expect(await component.canDeactivate()).toBeFalse();
      expect(dialog).toHaveBeenCalledWith(
        jasmine.anything(),
        jasmine.objectContaining({
          data: jasmine.objectContaining({
            message: jasmine.stringMatching('alterações neste lote'),
          }),
        }),
      );
    });

    it('restores the batch and saves replacement files under a fresh server request identity', async () => {
      expect(component.editing()).toBeTrue();
      expect(component.files().map((file) => file.name)).toEqual(['bad.png', 'keep.png']);
      expect(component.selectedEstadioId).toBe('e');
      component.removeFile(0);
      const replacement = new File(['replacement'], 'replacement.png', { type: 'image/png' });
      component.onFilesSelected({
        target: { files: [replacement], value: '' },
      } as unknown as Event);
      expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
      component.onLocationSelected({ latitude: -24, longitude: -50 }, component.files()[1]);

      await component.onSubmit();

      const saved = store.save.calls.mostRecent().args[0];
      expect(saved.id).toBe(failed.id);
      expect(saved.userId).toBe(failed.userId);
      expect(saved.createdAt).toBe(failed.createdAt);
      expect(saved.request.clientUploadId).not.toBe(failed.request.clientUploadId);
      expect(saved.backendUploadId).toBeUndefined();
      expect(saved.status).toBe('pending');
      expect(saved.failureKind).toBeUndefined();
      expect(saved.files.map((file) => file.fileName)).toEqual(['keep.png', 'replacement.png']);
      expect(
        saved.request.files.map(({ latitude, longitude }) => ({ latitude, longitude })),
      ).toEqual([
        { latitude: -25.4, longitude: -51.4 },
        { latitude: -24, longitude: -50 },
      ]);
      expect(await Promise.all(saved.files.map((file) => file.blob.text()))).toEqual([
        'keep this image',
        'replacement',
      ]);
      expect(sync.sync).not.toHaveBeenCalled();
    });

    it('retains the images and previous server identity if the corrected save cannot commit', async () => {
      store.save.and.rejectWith(new DOMException('Full', 'QuotaExceededError'));

      await component.onSubmit();

      expect(component.error()).toContain('Armazenamento cheio');
      expect(component.files().length).toBe(2);
      expect((await store.get(failed.id))?.backendUploadId).toBe('server-1');
      expect(sync.sync).not.toHaveBeenCalled();
    });

    it('does not overwrite a batch that started synchronizing in another tab', async () => {
      store.get.and.resolveTo({ ...failed, status: 'syncing' });

      await component.onSubmit();

      expect(store.save).not.toHaveBeenCalled();
      expect(component.error()).toContain('O lote mudou durante a edição');
      expect(component.files().length).toBe(2);
    });
  });
});
