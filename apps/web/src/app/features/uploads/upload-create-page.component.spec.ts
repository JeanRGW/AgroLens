import { ComponentFixture, TestBed } from '@angular/core/testing';
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

describe('UploadCreatePageComponent online uploads', () => {
  let fixture: ComponentFixture<UploadCreatePageComponent>;
  let component: UploadCreatePageComponent;
  let catalogs: jasmine.SpyObj<CatalogsService>;
  let uploads: jasmine.SpyObj<UploadCreateService>;
  let online: jasmine.Spy;
  let auth: AuthService;
  let api: jasmine.SpyObj<ApiService>;
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
    select(new File(['image'], 'photo.png', { type: 'image/png' }));
    component.onLocationSelected({ latitude: -25.4, longitude: -51.4 });
  });

  function select(...files: File[]) {
    component.onFilesSelected({ target: { files, value: '' } } as unknown as Event);
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
    select(new File(['other'], 'photo.png', { type: 'image/png' }));
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
    component.imageLocations.set([{ latitude: null, longitude: null }]);
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
    component.files.set([new File(['heic'], 'photo.heic', { type: 'image/heic' })]);
    await component.onSubmit();
    expect(uploads.createUpload).not.toHaveBeenCalled();
    expect(component.error()).toContain('HEIC');
  });

  it('normalizes untyped camera images and preserves their original bytes', async () => {
    select(new File(['camera'], 'capture.JPG', { lastModified: 123 }));
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
    expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
    component.onLocationSelected({ latitude: -20, longitude: -41 });
    expect(component.imageLocations()[0]).toEqual({ latitude: -25.4, longitude: -51.4 });
    expect(component.imageLocations()[1]).toEqual({ latitude: -20, longitude: -41 });
  });

  it('waits for fresh GPS and applies it only to the selected images', () => {
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    select(new File(['new'], 'new.png', { type: 'image/png' }));
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
    expect(component.imageLocations()).toEqual([
      { latitude: -25.4, longitude: -51.4 },
      { latitude: -20, longitude: -41 },
    ]);
  });

  it('reports GPS permission failure and ignores cancelled requests', () => {
    const gps = spyOn(navigator.geolocation, 'getCurrentPosition');
    component.setUseGps(true);
    select(new File(['new'], 'new.png', { type: 'image/png' }));
    gps.calls.mostRecent().args[1]?.({ code: 1 } as GeolocationPositionError);
    expect(component.gpsError()).toContain('Permita');
    component.applyCurrentLocation();
    const success = gps.calls.mostRecent().args[0];
    component.setUseGps(false);
    success({ coords: { latitude: -20, longitude: -41 } } as GeolocationPosition);
    expect(component.imageLocations()[1]).toEqual({ latitude: null, longitude: null });
  });

  it('applies only confirmed map points to the intended image', () => {
    component.openMap(0);
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    component.cancelMap();
    expect(component.imageLocations()[0]).toEqual({ latitude: -25.4, longitude: -51.4 });
    component.openMap(0);
    component.onMapDraftSelected({ latitude: -20, longitude: -41 });
    component.confirmMap();
    expect(component.imageLocations()[0]).toEqual({ latitude: -20, longitude: -41 });
  });

  it('offers native camera capture only on mobile platforms', () => {
    expect(isMobileCameraDevice('Windows', 'Win32', 0)).toBeFalse();
    expect(isMobileCameraDevice('Android', 'Linux', 5)).toBeTrue();
    expect(isMobileCameraDevice('iPhone', 'iPhone', 5)).toBeTrue();
    expect(isMobileCameraDevice('Macintosh', 'MacIntel', 5)).toBeTrue();
    expect(isMobileCameraDevice('Macintosh', 'MacIntel', 0)).toBeFalse();
  });
});
