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
import { UploadCreatePageComponent } from './upload-create-page.component';
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

  it('does not overwrite an individual image point when applying a batch location', () => {
    component.selectLocationTarget(0);
    component.onLocationSelected({ latitude: -21, longitude: -42 });
    component.selectLocationTarget(null);
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

  it('applies a batch point selected before images are added to the new images', async () => {
    component.removeFile(0);
    component.onLocationSelected({ latitude: -22, longitude: -43 });
    component.onFilesSelected({
      target: { files: [new File(['photo'], 'new.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);

    expect(component.imageLocations()).toEqual([{ latitude: -22, longitude: -43 }]);
    expect(component.missingLocationCount()).toBe(0);
    const confirm = spyOn(component['dialog'], 'open');
    await component.onSubmit();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.save.calls.mostRecent().args[0].request.files[0]).toEqual(
      jasmine.objectContaining({ latitude: -22, longitude: -43 }),
    );
  });

  it('does not give new images a selected per-image point', () => {
    component.selectLocationTarget(0);
    component.onLocationSelected({ latitude: -22, longitude: -43 });
    component.onFilesSelected({
      target: { files: [new File(['photo'], 'new.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);

    expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
  });

  it('locks the target and image removal until a pending GPS request resolves', () => {
    component.onFilesSelected({
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    component.selectLocationTarget(1);
    component.clearLocation();
    component.selectLocationTarget(0);
    fixture.detectChanges();
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');

    const picker = fixture.debugElement.query(By.directive(LocationPickerComponent))
      .componentInstance as LocationPickerComponent;
    picker.locateUser();
    fixture.detectChanges();
    const previews: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.preview-item'),
    );
    expect(previews[1].querySelector('button')!.disabled).toBeTrue();
    expect(previews[0].querySelector<HTMLButtonElement>('.preview-remove')!.disabled).toBeTrue();
    component.selectLocationTarget(1);
    component.removeFile(0);
    component.clearLocation();
    expect(component.locationTarget()).toBe(0);
    expect(component.files().length).toBe(2);

    const onSuccess = geolocation.calls.mostRecent().args[0] as PositionCallback;
    onSuccess({ coords: { latitude: -20, longitude: -41, accuracy: 5 } } as GeolocationPosition);

    expect(component.imageLocations()).toEqual([
      { latitude: -20, longitude: -41 },
      { latitude: null, longitude: null },
    ]);
    component.selectLocationTarget(1);
    expect(component.locationTarget()).toBe(1);
  });

  it('confirms and persists locationless images as an explicit null pair', async () => {
    component.clearLocation();
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
    expect(component.missingLocationCount()).toBe(0);
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
      component.selectLocationTarget(1);
      component.onLocationSelected({ latitude: -24, longitude: -50 });

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
