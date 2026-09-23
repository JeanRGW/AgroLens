import { TestBed } from '@angular/core/testing';

import { OfflineUploadSyncService } from './offline-upload-sync.service';
import { AuthService } from './auth.service';
import { OfflineUploadStoreService } from './offline-upload-store.service';
import {
  UploadCreateService,
  UploadFileTransferError,
  UploadProcessingError,
} from './upload-create.service';
import { OfflineUpload } from '../../shared/models/offline-upload';
import { UploadDetail } from '../../shared/models/upload-record';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionIdentityError } from '../interceptors/auth-context';
import { TimeoutError } from 'rxjs';
import { canCorrectOfflineUpload } from '../../shared/utils/offline-errors';

function buildUpload(overrides: Partial<OfflineUpload> = {}): OfflineUpload {
  return {
    id: 'local-1',
    userId: 'user-1',
    request: {
      clientUploadId: 'client-1',
      propertyId: 'p1',
      talhaoId: 't1',
      cropTypeId: 'c1',
      source: 'phone',
      activityDate: '2025-06-01T12:00:00Z',
      latitude: -15.5,
      longitude: -47.5,
      files: [{ fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 4 }],
    },
    files: [{ blob: new Blob(['data']), fileName: 'a.jpg', contentType: 'image/jpeg' }],
    status: 'pending',
    createdAt: '2025-06-01T12:00:00Z',
    updatedAt: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

const readyDetail: UploadDetail = {
  id: 'upload-1',
  clientUploadId: 'client-1',
  userId: 'user-1',
  propertyId: 'p1',
  talhaoId: 't1',
  cropTypeId: 'c1',
  estadioId: null,
  source: 'phone',
  status: 'ready',
  activityDate: '2025-06-01T12:00:00Z',
  latitude: -15.5,
  longitude: -47.5,
  errorMessage: null,
  createdAt: '2025-06-01T12:00:00Z',
  updatedAt: '2025-06-01T12:00:01Z',
  files: [],
};

describe('OfflineUploadSyncService', () => {
  let service: OfflineUploadSyncService;
  let store: jasmine.SpyObj<OfflineUploadStoreService>;
  let authService: jasmine.SpyObj<AuthService>;
  let uploadCreateService: jasmine.SpyObj<UploadCreateService>;

  beforeEach(() => {
    store = jasmine.createSpyObj('OfflineUploadStoreService', ['save', 'list', 'delete', 'get']);
    store.get.and.callFake(async (id) => buildUpload({ id }));
    authService = jasmine.createSpyObj('AuthService', [
      'ensureSession',
      'user',
      'assertIdentity',
      'reauthenticationRequired',
    ]);
    authService.user.and.returnValue({ id: 'user-1' } as ReturnType<AuthService['user']>);
    authService.reauthenticationRequired.and.returnValue(false);
    uploadCreateService = jasmine.createSpyObj('UploadCreateService', ['createUpload']);
    store.save.and.resolveTo();
    store.delete.and.resolveTo();
    store.list.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        OfflineUploadSyncService,
        { provide: OfflineUploadStoreService, useValue: store },
        { provide: AuthService, useValue: authService },
        { provide: UploadCreateService, useValue: uploadCreateService },
      ],
    });
    service = TestBed.inject(OfflineUploadSyncService);
  });

  it('marks a batch failed when the browser is offline', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);

    const result = await service.sync(buildUpload());

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/Sem conexão/);
    expect(store.save).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'failed' }));
    expect(uploadCreateService.createUpload).not.toHaveBeenCalled();
  });

  it('marks a batch failed when the session cannot be refreshed', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    authService.ensureSession.and.resolveTo(null);

    const result = await service.sync(buildUpload());

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/sessão expirou/);
    expect(uploadCreateService.createUpload).not.toHaveBeenCalled();
  });

  it('uploads a pending batch and removes it after success', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.resolveTo(readyDetail);

    const result = await service.sync(buildUpload());

    expect(result.status).toBe('completed');
    expect(result.backendUploadId).toBe('upload-1');
    expect(store.save).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'syncing' }));
    expect(store.delete).toHaveBeenCalledWith('local-1');
  });

  it('uses the resolved queued MIME type when reconstructing an untyped capture for upload', async () => {
    const upload = buildUpload();
    upload.request.files = [{ fileName: 'capture.PNG', contentType: 'image/png', sizeBytes: 4 }];
    upload.files = [
      { blob: new Blob(['data']), fileName: 'capture.PNG', contentType: 'image/png' },
    ];
    store.get.and.resolveTo(upload);
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.resolveTo(readyDetail);

    const result = await service.sync(upload);

    const [request, files] = uploadCreateService.createUpload.calls.mostRecent().args;
    expect(request.files[0].contentType).toBe('image/png');
    expect(files[0].type).toBe('image/png');
    expect(await files[0].text()).toBe('data');
    expect(result.status).toBe('completed');
  });

  it('skips completed batches when syncing all', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    store.list.and.resolveTo([
      buildUpload({ id: 'done', status: 'completed' }),
      buildUpload({ id: 'pending' }),
    ]);
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.resolveTo(readyDetail);

    await service.syncAll('user-1');

    expect(uploadCreateService.createUpload).toHaveBeenCalledTimes(1);
  });

  it('never sends or deletes a batch after a refreshed account changes', async () => {
    authService.ensureSession.and.callFake(async () => {
      authService.assertIdentity.and.throwError(new SessionIdentityError());
      return 'token-other-user';
    });
    const result = await service.sync(buildUpload());
    expect(result.failureKind).toBe('auth');
    expect(uploadCreateService.createUpload).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledWith(
      jasmine.objectContaining({ userId: 'user-1', status: 'failed' }),
    );
  });

  it('deduplicates concurrent page and coordinator synchronization', async () => {
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.resolveTo(readyDetail);
    const [first, second] = await Promise.all([
      service.sync(buildUpload()),
      service.sync(buildUpload()),
    ]);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(uploadCreateService.createUpload).toHaveBeenCalledTimes(1);
  });

  it('does not recreate a batch deleted by another tab', async () => {
    store.get.and.resolveTo(undefined);
    await service.sync(buildUpload());
    expect(uploadCreateService.createUpload).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('retains files and the backend ID on interruption and schedules a retry', async () => {
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.callFake(async (_request, _files, _progress, options) => {
      await options!.onInitialized('server-1');
      throw new HttpErrorResponse({ status: 0 });
    });
    const result = await service.sync(buildUpload());
    expect(result.backendUploadId).toBe('server-1');
    expect(result.retryAfter).toBeDefined();
    expect(result.request.clientUploadId).toBe('client-1');
    expect(result.files.length).toBe(1);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('releases a timed-out finalization attempt with its files and request identity available for retry', async () => {
    const upload = buildUpload();
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.callFake(async (_request, _files, _progress, options) => {
      await options!.onInitialized('upload-1');
      throw new TimeoutError();
    });

    const failed = await service.sync(upload);

    expect(service.syncing()).toBeFalse();
    expect(failed.failureKind).toBe('network');
    expect(failed.retryAfter).toBeDefined();
    expect(failed.backendUploadId).toBe('upload-1');
    expect(failed.request.clientUploadId).toBe('client-1');
    expect(await failed.files[0].blob.text()).toBe('data');
    expect(store.delete).not.toHaveBeenCalled();

    store.get.and.resolveTo(failed);
    uploadCreateService.createUpload.and.resolveTo(readyDetail);
    const result = await service.sync(failed);
    expect(result.status).toBe('completed');
    expect(uploadCreateService.createUpload.calls.mostRecent().args[0]).toEqual(upload.request);
    expect(store.delete).toHaveBeenCalledOnceWith('local-1');
  });

  it('marks deleted catalogs for correction instead of endless automatic retries', async () => {
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.rejectWith(new HttpErrorResponse({ status: 404 }));
    const result = await service.sync(buildUpload());
    expect(result.failureKind).toBe('catalog');
    expect(service.canAutoSync(result)).toBeFalse();
    expect(result.files.length).toBe(1);
  });

  it('preserves terminal processing failures for correction without automatic retries', async () => {
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.callFake(async (_request, _files, _progress, options) => {
      await options!.onInitialized('server-1');
      throw new UploadProcessingError('Corrupted image');
    });

    const result = await service.sync(buildUpload());

    expect(result.status).toBe('failed');
    expect(result.failureKind).toBe('processing');
    expect(result.errorMessage).toBe('Corrupted image');
    expect(result.backendUploadId).toBe('server-1');
    expect(await result.files[0].blob.text()).toBe('data');
    expect(result.retryAfter).toBeUndefined();
    expect(canCorrectOfflineUpload(result)).toBeTrue();
    expect(store.delete).not.toHaveBeenCalled();

    store.list.and.resolveTo([result]);
    uploadCreateService.createUpload.calls.reset();
    await service.syncAll('user-1', undefined, true);
    expect(uploadCreateService.createUpload).not.toHaveBeenCalled();
  });

  [
    { name: 'API completion rejects the payload', error: new HttpErrorResponse({ status: 400 }) },
    {
      name: 'storage rejects an oversized file',
      error: new UploadFileTransferError(413, 'Too large'),
    },
  ].forEach(({ name, error }) => {
    it(`preserves the initialized batch for correction when ${name}`, async () => {
      authService.ensureSession.and.resolveTo('token');
      uploadCreateService.createUpload.and.callFake(
        async (_request, _files, _progress, options) => {
          await options!.onInitialized('server-1');
          throw error;
        },
      );

      const result = await service.sync(buildUpload());

      expect(result.failureKind).toBe('validation');
      expect(result.backendUploadId).toBe('server-1');
      expect(result.request.clientUploadId).toBe('client-1');
      expect(await result.files[0].blob.text()).toBe('data');
      expect(result.retryAfter).toBeUndefined();
      expect(service.canAutoSync(result)).toBeFalse();
      expect(store.delete).not.toHaveBeenCalled();
    });
  });

  it('retries expired storage URLs without treating them as an expired app session', async () => {
    authService.ensureSession.and.resolveTo('token');
    uploadCreateService.createUpload.and.rejectWith(
      new UploadFileTransferError(403, 'Expired URL'),
    );

    const result = await service.sync(buildUpload());

    expect(result.failureKind).toBe('network');
    expect(result.retryAfter).toBeDefined();
    expect(result.request.clientUploadId).toBe('client-1');
  });
});
