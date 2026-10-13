import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { UploadCreateService } from '../../core/services/upload-create.service';
import { UploadDetail } from '../../shared/models/upload-record';
import { isMobileCameraDevice, UploadCreatePageComponent } from './upload-create-page.component';
import { ImageMetadataService } from '../../core/services/image-metadata.service';
import { normalizeImageLocation, type ImageLocation } from '@agrolens/contracts';

describe('UploadCreatePageComponent online uploads', () => {
  let fixture: ComponentFixture<UploadCreatePageComponent>;
  let component: UploadCreatePageComponent;
  let catalogs: jasmine.SpyObj<CatalogsService>;
  let uploads: jasmine.SpyObj<UploadCreateService>;
  let online: jasmine.Spy;
  let auth: AuthService;
  let api: jasmine.SpyObj<ApiService>;
  let metadata: jasmine.SpyObj<ImageMetadataService>;
  const user = { id: 'u', email: 'u@test', fullName: 'User', role: 'user' };

  beforeEach(async () => {
    online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    catalogs = jasmine.createSpyObj('CatalogsService', [
      'listProperties',
      'listTalhoes',
      'listCropTypes',
      'listEstadios',
    ]);
    catalogs.listProperties.and.resolveTo([
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
    ]);
    catalogs.listTalhoes.and.resolveTo([
      { id: 't', name: 'Field', propertyId: 'p', userId: 'u', createdAt: '' },
    ]);
    catalogs.listCropTypes.and.resolveTo([{ id: 'c', name: 'Crop', userId: 'u', createdAt: '' }]);
    catalogs.listEstadios.and.resolveTo([
      { id: 'e', name: 'Stage', cropTypeId: 'c', userId: 'u', createdAt: '' },
    ]);
    uploads = jasmine.createSpyObj('UploadCreateService', ['createUpload']);
    metadata = jasmine.createSpyObj('ImageMetadataService', ['extract']);
    metadata.extract.and.resolveTo(normalizeImageLocation(null));
    api = jasmine.createSpyObj('ApiService', ['get', 'post']);
    api.post.and.returnValue(of({ accessToken: 'token', user }));
    api.get.and.returnValue(of({ user }));
    uploads.createUpload.and.resolveTo({ id: 'server-1', status: 'ready' } as UploadDetail);
    await TestBed.configureTestingModule({
      imports: [UploadCreatePageComponent],
      providers: [
        AuthService,
        SessionService,
        { provide: ApiService, useValue: api },
        { provide: CatalogsService, useValue: catalogs },
        { provide: UploadCreateService, useValue: uploads },
        { provide: ImageMetadataService, useValue: metadata },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        provideRouter([]),
      ],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
    await auth.login('u@test', 'password');
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
    component.cancelMap();
    await select(new File(['image'], 'photo.png', { type: 'image/png' }));
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
  });

  async function select(...files: File[]) {
    await component.onFilesSelected({ target: { files, value: '' } } as unknown as Event);
  }

  it('loads all catalogs online and sends metadata and original bytes directly', async () => {
    await component.onSubmit();
    const [request, files, , options] = uploads.createUpload.calls.mostRecent().args;
    expect(request).toEqual(
      jasmine.objectContaining({ propertyId: 'p', talhaoId: 't', cropTypeId: 'c', estadioId: 'e' }),
    );
    expect(request.files[0]).toEqual(
      jasmine.objectContaining({ latitude: -25.4, longitude: -51.4 }),
    );
    expect(await files[0].text()).toBe('image');
    expect(options?.userId).toBe('u');
    expect(catalogs.listProperties).toHaveBeenCalled();
    expect(component.files()).toEqual([]);
  });

  it('does not send or save an upload when disconnected', async () => {
    online.and.returnValue(false);
    window.dispatchEvent(new Event('offline'));
    await component.onSubmit();
    expect(uploads.createUpload).not.toHaveBeenCalled();
    expect(component.files().length).toBe(1);
  });

  it('retains files and stable request IDs for an in-memory network retry', async () => {
    uploads.createUpload.and.rejectWith(new Error('Network unavailable'));
    await component.onSubmit();
    const first = uploads.createUpload.calls.mostRecent().args[0];
    expect(component.files().length).toBe(1);
    expect(component.error()).toContain('Network unavailable');
    await component.onSubmit();
    expect(uploads.createUpload.calls.mostRecent().args[0]).toBe(first);
    component.selectedEstadioId = '';
    await component.onSubmit();
    expect(uploads.createUpload.calls.mostRecent().args[0].clientUploadId).not.toBe(
      first.clientUploadId,
    );
  });

  it('retries the same upload after a transient authentication refresh failure', async () => {
    api.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    uploads.createUpload.and.callFake(async (_request, _files, _progress, options) => {
      options?.assertIdentity();
      await auth.refreshSession(options?.userId);
      return { id: 'server-1', status: 'ready' } as UploadDetail;
    });
    const files = component.files();
    await component.onSubmit();
    const request = uploads.createUpload.calls.mostRecent().args[0];
    expect(component.files()).toBe(files);
    expect(auth.user()?.id).toBe('u');
    api.post.and.returnValue(of({ accessToken: 'fresh' }));
    await component.onSubmit();
    expect(uploads.createUpload.calls.mostRecent().args[0]).toBe(request);
    expect(component.completedUploadId()).toBe('server-1');
    expect(component.files()).toEqual([]);
  });

  it('replaces retry identity when an image changes', async () => {
    uploads.createUpload.and.rejectWith(new Error('Network unavailable'));
    await component.onSubmit();
    const first = uploads.createUpload.calls.mostRecent().args[0];
    component.removeFile(0);
    await select(new File(['other'], 'photo.png', { type: 'image/png' }));
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
    await component.onSubmit();
    expect(uploads.createUpload.calls.mostRecent().args[0].clientUploadId).not.toBe(
      first.clientUploadId,
    );
  });

  it('confirms leaving with unsent images and protects active transfers', async () => {
    const dialog = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(false),
    } as never);
    expect(await component.canDeactivate()).toBeFalse();
    dialog.calls.reset();
    component.submitting.set(true);
    expect(await component.canDeactivate()).toBeFalse();
    expect(dialog).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.onBeforeUnload(unload);
    expect(unload.defaultPrevented).toBeTrue();
    component.submitting.set(false);
    component.removeFile(0);
    expect(await component.canDeactivate()).toBeTrue();
  });

  it('shows only the completion card after readiness', async () => {
    await component.onSubmit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.completion-card')).not.toBeNull();
    expect(page.querySelector('.progress-card')).toBeNull();
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.completion-card a')?.getAttribute('href')).toBe(
      '/uploads/server-1',
    );
  });

  it('confirms unlocated images and sends an explicit null coordinate pair', async () => {
    component.selectedImages.update((images) =>
      images.map((image) => ({ ...image, location: null, locationSource: 'file' })),
    );
    const confirm = spyOn(component['dialog'], 'open').and.returnValue({
      afterClosed: () => of(true),
    } as never);
    await component.onSubmit();
    expect(confirm).toHaveBeenCalled();
    expect(uploads.createUpload.calls.mostRecent().args[0].files[0]).toEqual(
      jasmine.objectContaining({ latitude: null, longitude: null }),
    );
  });

  it('rejects unsupported images before transferring', async () => {
    component.selectedImages.update((images) =>
      images.map((image) => ({
        ...image,
        file: new File(['heic'], 'photo.heic', { type: 'image/heic' }),
      })),
    );
    await component.onSubmit();
    expect(uploads.createUpload).not.toHaveBeenCalled();
    expect(component.error()).toContain('HEIC');
  });

  it('normalizes untyped camera images and preserves their original bytes', async () => {
    await select(new File(['camera'], 'capture.JPG', { lastModified: 123 }));
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
    await component.onSubmit();
    const [request, files] = uploads.createUpload.calls.mostRecent().args;
    expect(request.files[1].contentType).toBe('image/jpeg');
    expect(files[1].type).toBe('image/jpeg');
    expect(await files[1].text()).toBe('camera');
  });

  it('reloads catalogs without discarding photos or metadata', async () => {
    const files = component.files();
    catalogs.listTalhoes.and.resolveTo([
      { id: 'replacement', name: 'New', propertyId: 'p', userId: 'u', createdAt: '' },
    ]);
    await component.loadCatalogs();
    expect(component.filteredTalhoes()[0].id).toBe('replacement');
    expect(component.files()).toBe(files);
    expect(component.selectedEstadioId).toBe('e');
  });

  it('does not reuse an old location for newly added images', () => {
    select(new File(['new'], 'new.png', { type: 'image/png' }));
    expect(component.selectedImages()[1].location).toBeNull();
    component.onLocationSelected({ latitude: -20, longitude: -41 });
    expect(component.selectedImages()[0].location).toEqual({ latitude: -25.4, longitude: -51.4 });
    expect(component.selectedImages()[1].location).toEqual({ latitude: -20, longitude: -41 });
  });

  it('requests GPS only when explicitly applied to imported unlocated images', async () => {
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    await select(new File(['new'], 'new.png', { type: 'image/png' }));
    expect(gps).not.toHaveBeenCalled();
    component.applyCurrentLocation();
    expect(component.gpsPending()).toBeTrue();
    expect(component.missingLocationCount()).toBe(0);
    expect(gps.calls.mostRecent().args[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    gps.calls
      .mostRecent()
      .args[0]({ coords: { latitude: -20, longitude: -41 } } as GeolocationPosition);
    expect(component.gpsPending()).toBeFalse();
    expect(component.selectedImages().map((image) => image.location)).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -20, longitude: -41 },
    ]);
  });

  it('reports GPS permission failure and ignores cancelled requests', async () => {
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    await select(new File(['new'], 'new.png', { type: 'image/png' }));
    component.applyCurrentLocation();
    gps.calls.mostRecent().args[1]?.({ code: 1 } as GeolocationPositionError);
    expect(component.gpsError()).toContain('Permita');
    component.applyCurrentLocation();
    const success = gps.calls.mostRecent().args[0];
    component.setUseGps(false);
    success({ coords: { latitude: -20, longitude: -41 } } as GeolocationPosition);
    expect(component.selectedImages()[1].location).toBeNull();
  });

  it('applies only confirmed map points to the intended image', () => {
    component.openMap(0);
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    component.cancelMap();
    expect(component.selectedImages()[0].location).toEqual({ latitude: -25.4, longitude: -51.4 });
    component.openMap(0);
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    component.confirmMap();
    expect(component.selectedImages()[0].location).toEqual({ latitude: -20, longitude: -41 });
  });

  it('keeps the manual-mode map visible after confirmation and cancellation without a toggle', async () => {
    component.setUseGps(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(LocationPickerComponent))).not.toBeNull();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(
      buttons.some((button) => /Selecionar no mapa|Ocultar mapa/.test(button.textContent ?? '')),
    ).toBeFalse();
    expect(component.visibleMapSelection()?.point).toBeNull();
    component.onMapDraftSelected({ latitude: 1, longitude: 2 });
    component.confirmMap();
    expect(component.visibleMapSelection()).not.toBeNull();
    component.openMap(0);
    expect(component.visibleMapSelection()?.file).toBe(component.files()[0]);
    component.cancelMap();
    expect(component.visibleMapSelection()).not.toBeNull();
    expect(component.visibleMapSelection()?.point).toBeNull();
    component.setUseGps(true);
    expect(component.visibleMapSelection()).toBeNull();
  });

  it('ignores GPS from a cancelled image selection when the persistent picker is reused', async () => {
    await select(new File(['photo'], 'second.jpg', { type: 'image/jpeg' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component.openMap(0);
    fixture.detectChanges();
    const picker = component.locationPicker!;
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    picker.locateUser();
    const cancelled = gps.calls.mostRecent().args[0];
    expect(component.mapGpsPending()).toBeTrue();
    component.cancelMap();
    component.openMap(1);
    fixture.detectChanges();
    expect(component.locationPicker).toBe(picker);
    expect(picker.locating()).toBeFalse();
    cancelled({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
    expect(component.mapSelection()?.point).toBeNull();
    component.confirmMap();
    expect(component.selectedImages()[1].location).toBeNull();
    picker.locateUser();
    gps.calls
      .mostRecent()
      .args[0]({ coords: { latitude: 3, longitude: 4, accuracy: 5 } } as GeolocationPosition);
    component.confirmMap();
    expect(component.selectedImages()[1].location).toEqual({ latitude: 3, longitude: 4 });
  });

  it('offers native camera capture only on mobile platforms', () => {
    expect(isMobileCameraDevice('Windows', 'Win32', 0)).toBeFalse();
    expect(isMobileCameraDevice('Android', 'Linux', 5)).toBeTrue();
    expect(isMobileCameraDevice('iPhone', 'iPhone', 5)).toBeTrue();
    expect(isMobileCameraDevice('Macintosh', 'MacIntel', 5)).toBeTrue();
    expect(isMobileCameraDevice('Macintosh', 'MacIntel', 0)).toBeFalse();
  });

  it('keeps image cards photo-only and moves location details into the map panel', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector('.preview-item')!;
    expect(card.textContent).not.toContain('-25.4');
    expect(card.textContent).not.toContain('Localização manual');
    expect(card.querySelector('small')).toBeNull();
    const button = card.querySelector<HTMLButtonElement>('.preview-location')!;
    expect(button.getAttribute('aria-label')).toContain('Localização manual');
    button.click();
    fixture.detectChanges();
    expect(component.selectedMapImage()?.file).toBe(component.files()[0]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.upload-create__map-panel')
        ?.textContent,
    ).toContain('Localização manual');
  });

  it('shows Localizar only for missing locations and uses the same control while reading', async () => {
    component.selectedImages.update((images) =>
      images.map((image) => ({ ...image, location: null, locationSource: 'file' })),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.preview-location')?.textContent).toContain('Localizar');
    component.selectedImages.update((images) =>
      images.map((image) => ({ ...image, readingLocation: true })),
    );
    fixture.detectChanges();
    expect(page.querySelector('.preview-location')?.getAttribute('aria-busy')).toBe('true');
    expect(page.querySelector('.preview-location')?.textContent).not.toContain('Localizar');
  });

  it('uses independent file GPS for imports without asking for device GPS', async () => {
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    metadata.extract.and.resolveTo(
      normalizeImageLocation({ 'drone-dji': { GpsLatitude: -20, GpsLongitude: -41 } }),
    );
    await select(new File(['drone'], 'drone.jpg', { type: 'image/jpeg' }));
    expect(component.selectedImages()[1].location).toEqual({ latitude: -20, longitude: -41 });
    expect(component.selectedImages()[1].locationSource).toBe('file');
    expect(gps).not.toHaveBeenCalled();
  });

  it('never overwrites a manual choice with delayed file metadata', async () => {
    let resolve!: (metadata: ImageLocation) => void;
    metadata.extract.and.returnValue(new Promise((done) => (resolve = done)));
    const file = new File(['drone'], 'drone.jpg', { type: 'image/jpeg' });
    const pending = select(file);
    component.onLocationSelected({ latitude: 1, longitude: 2 }, file);
    resolve(normalizeImageLocation({ 'drone-dji': { GpsLatitude: 3, GpsLongitude: 4 } }));
    await pending;
    expect(component.selectedImages()[1].location).toEqual({ latitude: 1, longitude: 2 });
    expect(component.selectedImages()[1].locationSource).toBe('manual');
  });

  it('allows confirmed GPS to replace file coordinates without removing location', async () => {
    metadata.extract.and.resolveTo(
      normalizeImageLocation({ 'drone-dji': { GpsLatitude: 3, GpsLongitude: 4 } }),
    );
    await select(new File(['photo'], 'drone.jpg', { type: 'image/jpeg' }));
    component.openMap(1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Sem localização',
      ),
    ).toBeFalse();
    const picker = fixture.debugElement.query(By.directive(LocationPickerComponent))
      .componentInstance as LocationPickerComponent;
    expect(picker.gpsButtonEnabled).toBeTrue();
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    picker.locateUser();
    component.confirmMap();
    expect(component.selectedImages()[1].locationSource).toBe('file');
    gps.calls
      .mostRecent()
      .args[0]({ coords: { latitude: 1, longitude: 2, accuracy: 5 } } as GeolocationPosition);
    expect(component.selectedImages()[1].location).toEqual({ latitude: 3, longitude: 4 });
    component.confirmMap();
    expect(component.selectedImages()[1].location).toEqual({ latitude: 1, longitude: 2 });
    await component.onSubmit();
    expect(uploads.createUpload.calls.mostRecent().args[0].files[1]).toEqual(
      jasmine.objectContaining({ latitude: 1, longitude: 2, locationSource: 'manual' }),
    );
  });

  it('ignores metadata from a file removed before parsing completes', async () => {
    let resolve!: (metadata: ImageLocation) => void;
    metadata.extract.and.returnValue(new Promise((done) => (resolve = done)));
    const pending = select(new File(['photo'], 'drone.jpg', { type: 'image/jpeg' }));
    component.removeFile(1);
    resolve(normalizeImageLocation({ 'drone-dji': { GpsLatitude: 3, GpsLongitude: 4 } }));
    await pending;
    expect(component.selectedImages().map((image) => image.location)).toEqual([
      { latitude: -25.4, longitude: -51.4 },
    ]);
    expect(component.readingLocations()).toBeFalse();
  });
});
