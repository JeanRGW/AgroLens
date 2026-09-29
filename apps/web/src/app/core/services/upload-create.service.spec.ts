import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import {
  UploadCreateService,
  UploadFileTransferError,
  UploadProcessingError,
} from './upload-create.service';
import { UploadsService } from './uploads.service';
import { EXPECTED_USER_ID } from '../interceptors/auth-context';
import {
  InitUploadRequest,
  InitUploadResponse,
  UploadDetail,
  UploadMutationRecord,
} from '../../shared/models/upload-record';

const FAKE_RECORD_READY: UploadMutationRecord = {
  id: 'upload-1',
  clientUploadId: 'client-1',
  userId: 'u1',
  propertyId: 'p1',
  talhaoId: 't1',
  cropTypeId: 'c1',
  estadioId: null,
  source: 'phone',
  status: 'ready',
  activityDate: '2025-06-01T12:00:00Z',
  errorMessage: null,
  createdAt: '2025-06-01T12:00:00Z',
  updatedAt: '2025-06-01T12:00:01Z',
  deletedAt: null,
};

const FAKE_DETAIL_READY: UploadDetail = {
  id: 'upload-1',
  clientUploadId: 'client-1',
  userId: 'u1',
  propertyId: 'p1',
  talhaoId: 't1',
  cropTypeId: 'c1',
  estadioId: null,
  source: 'phone',
  status: 'ready',
  activityDate: '2025-06-01T12:00:00Z',
  errorMessage: null,
  createdAt: '2025-06-01T12:00:00Z',
  updatedAt: '2025-06-01T12:00:01Z',
  files: [],
};

const FAKE_DETAIL_FINALIZING: UploadDetail = {
  ...FAKE_DETAIL_READY,
  status: 'finalizing',
};

const FAKE_DETAIL_FAILED: UploadDetail = {
  ...FAKE_DETAIL_READY,
  status: 'failed',
  errorMessage: 'Corrupted image',
};

const FAKE_INIT_RESPONSE: InitUploadResponse = {
  uploadId: 'upload-1',
  status: 'draft',
  files: [
    {
      imageId: 'image-0',
      fileId: 'file-0',
      uploadUrl: 'https://presigned.example.com/0',
      objectKey: 'key0',
      method: 'PUT',
      headers: {},
      expiresAt: '2025-06-01T12:15:00Z',
    },
    {
      imageId: 'image-1',
      fileId: 'file-1',
      uploadUrl: 'https://presigned.example.com/1',
      objectKey: 'key1',
      method: 'PUT',
      headers: {},
      expiresAt: '2025-06-01T12:15:00Z',
    },
  ],
};

describe('UploadCreateService', () => {
  let service: UploadCreateService;
  let uploadsService: jasmine.SpyObj<UploadsService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('UploadsService', [
      'initUpload',
      'completeUpload',
      'getUpload',
    ]);

    TestBed.configureTestingModule({
      providers: [UploadCreateService, { provide: UploadsService, useValue: spy }],
    });

    service = TestBed.inject(UploadCreateService);
    uploadsService = TestBed.inject(UploadsService) as jasmine.SpyObj<UploadsService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createUpload', () => {
    const request: InitUploadRequest = {
      clientUploadId: 'client-1',
      propertyId: 'p1',
      talhaoId: 't1',
      cropTypeId: 'c1',
      source: 'phone',
      activityDate: '2025-06-01T12:00:00Z',
      files: [
        {
          imageId: 'image-0',
          contentType: 'image/jpeg',
          sizeBytes: 100,
          latitude: -15.5,
          longitude: -47.5,
        },
        {
          imageId: 'image-1',
          contentType: 'image/jpeg',
          sizeBytes: 200,
          latitude: -15.5,
          longitude: -47.5,
        },
      ],
    };

    const fakeFiles: File[] = [
      new File(['fake-content-a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['fake-content-b'], 'b.jpg', { type: 'image/jpeg' }),
    ];

    beforeEach(() => {
      spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 200 }));
    });

    it('should complete the full flow (init → uploads → complete → poll ready)', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      // First poll returns finalizing, second returns ready
      uploadsService.getUpload.and.returnValues(
        Promise.resolve(FAKE_DETAIL_FINALIZING),
        Promise.resolve(FAKE_DETAIL_READY),
      );

      const progressSpy = jasmine.createSpy('progress');

      const result = await service.createUpload(request, fakeFiles, progressSpy);

      expect(result.status).toBe('ready');
      expect(result.id).toBe('upload-1');
      expect(uploadsService.initUpload).toHaveBeenCalledWith(request);
      expect(uploadsService.completeUpload).toHaveBeenCalledWith('upload-1');
      expect(window.fetch).toHaveBeenCalledTimes(2);
      expect(window.fetch).toHaveBeenCalledWith(
        'https://presigned.example.com/0',
        jasmine.objectContaining({ method: 'PUT' }),
      );
      expect(window.fetch).toHaveBeenCalledWith(
        'https://presigned.example.com/1',
        jasmine.objectContaining({ method: 'PUT' }),
      );

      // Progress was emitted throughout the flow
      expect(progressSpy).toHaveBeenCalledWith(jasmine.objectContaining({ phase: 'init' }));
      expect(progressSpy).toHaveBeenCalledWith(jasmine.objectContaining({ phase: 'uploading' }));
      expect(progressSpy).toHaveBeenCalledWith(jasmine.objectContaining({ phase: 'completing' }));
      expect(progressSpy).toHaveBeenCalledWith(jasmine.objectContaining({ phase: 'finalizing' }));
      expect(progressSpy).toHaveBeenCalledWith(jasmine.objectContaining({ phase: 'ready' }));
    });

    it('matches reversed retry instructions to local files by image ID', async () => {
      uploadsService.initUpload.and.resolveTo({
        ...FAKE_INIT_RESPONSE,
        files: [...FAKE_INIT_RESPONSE.files].reverse(),
      });
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_READY);

      await service.createUpload(request, fakeFiles);

      expect(window.fetch).toHaveBeenCalledWith(
        'https://presigned.example.com/1',
        jasmine.objectContaining({ body: fakeFiles[1] }),
      );
      expect(window.fetch).toHaveBeenCalledWith(
        'https://presigned.example.com/0',
        jasmine.objectContaining({ body: fakeFiles[0] }),
      );
    });

    it('should reject incomplete presigned instructions', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);

      await expectAsync(service.createUpload(request, fakeFiles.slice(0, 1))).toBeRejectedWithError(
        /instruções de arquivo incompletas/,
      );
    });

    it('should throw if a presigned PUT fails', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      (window.fetch as jasmine.Spy).and.resolveTo(
        new Response(null, { status: 403, statusText: 'Forbidden' }),
      );

      await expectAsync(service.createUpload(request, fakeFiles)).toBeRejectedWithError(
        /Falha ao enviar/,
      );
    });

    it('preserves a rejected file PUT status after persisting the server upload ID', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      (window.fetch as jasmine.Spy).and.resolveTo(
        new Response(null, { status: 413, statusText: 'Payload Too Large' }),
      );
      const initialized = jasmine.createSpy('initialized').and.resolveTo();

      await expectAsync(
        service.createUpload(request, fakeFiles, undefined, {
          userId: 'u1',
          assertIdentity: () => undefined,
          onInitialized: initialized,
        }),
      ).toBeRejectedWith(
        jasmine.objectContaining({ name: UploadFileTransferError.name, status: 413 }),
      );
      expect(initialized).toHaveBeenCalledWith('upload-1');
      expect(initialized).toHaveBeenCalledBefore(window.fetch as jasmine.Spy);
      expect(uploadsService.completeUpload).not.toHaveBeenCalled();
    });

    it('recovers a concurrent completion instead of offering correction of a ready upload', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      uploadsService.completeUpload.and.rejectWith(new HttpErrorResponse({ status: 409 }));
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_READY);

      const result = await service.createUpload(request, fakeFiles);

      expect(result).toEqual(FAKE_DETAIL_READY);
      expect(uploadsService.getUpload).toHaveBeenCalledWith('upload-1', undefined, 5000);
    });

    it('should throw on failed status after polling', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_FAILED);

      await expectAsync(service.createUpload(request, fakeFiles)).toBeRejectedWithError(
        UploadProcessingError,
        /Corrupted image/,
      );
    });

    it('bounds slow successful finalization polls by elapsed time, retaining the batch for retry', fakeAsync(() => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.callFake(
        () => new Promise((resolve) => setTimeout(() => resolve(FAKE_DETAIL_FINALIZING), 4000)),
      );
      const failed = jasmine.createSpy('failed');
      void service.createUpload(request, fakeFiles).catch(failed);

      tick(29999);
      expect(failed).not.toHaveBeenCalled();
      tick(1);
      expect(failed).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ message: jasmine.stringMatching(/continua salvo/) }),
      );
      expect(uploadsService.getUpload).toHaveBeenCalledTimes(5);
      tick(60000);
      expect(uploadsService.getUpload).toHaveBeenCalledTimes(5);
    }));

    it('should work without progress callback', async () => {
      uploadsService.initUpload.and.resolveTo(FAKE_INIT_RESPONSE);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.returnValues(
        Promise.resolve(FAKE_DETAIL_FINALIZING),
        Promise.resolve(FAKE_DETAIL_READY),
      );

      const result = await service.createUpload(request, fakeFiles);
      expect(result.status).toBe('ready');
    });

    it('should use files[] (not presignedUrls) from init response — regression for contract mismatch', async () => {
      // Backend returns { uploadId, status, files: [{ uploadUrl, ... }] }
      // Older code expected { id, presignedUrls: [{ url, ... }] } which caused
      // "Cannot read properties of undefined (reading 'length')" on presignedUrls.
      const newFormatResponse: InitUploadResponse = {
        uploadId: 'upload-new',
        status: 'draft',
        files: [
          {
            imageId: 'image-0',
            fileId: 'f0',
            uploadUrl: 'https://new-backend.example.com/upload/0',
            objectKey: 'uploads/u1/upload-new/0/original.jpg',
            method: 'PUT',
            headers: { 'x-amz-acl': 'private' },
            expiresAt: '2025-06-01T12:15:00Z',
          },
        ],
      };
      const singleFile = [new File(['data'], 'photo.jpg', { type: 'image/jpeg' })];
      const singleFileRequest: InitUploadRequest = {
        ...request,
        files: [request.files[0]],
      };

      uploadsService.initUpload.and.resolveTo(newFormatResponse);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_READY);

      const result = await service.createUpload(singleFileRequest, singleFile);

      expect(result.status).toBe('ready');
      expect(uploadsService.completeUpload).toHaveBeenCalledWith('upload-new');
      expect(window.fetch).toHaveBeenCalledWith(
        'https://new-backend.example.com/upload/0',
        jasmine.objectContaining({
          method: 'PUT',
          headers: jasmine.objectContaining({ 'x-amz-acl': 'private' }),
        }),
      );
    });

    it('should throw if init response has empty files array', async () => {
      const emptyFilesResponse: InitUploadResponse = {
        uploadId: 'upload-empty',
        status: 'draft',
        files: [],
      };
      uploadsService.initUpload.and.resolveTo(emptyFilesResponse);

      await expectAsync(service.createUpload(request, fakeFiles)).toBeRejectedWithError(
        /instruções de arquivo incompletas/,
      );
    });

    it('should skip files with empty uploadUrl (already uploaded on retry)', async () => {
      const retryResponse: InitUploadResponse = {
        uploadId: 'upload-retry',
        status: 'draft',
        files: [
          {
            imageId: 'image-0',
            fileId: 'f0',
            uploadUrl: '', // Already uploaded
            objectKey: 'key0',
            method: 'PUT',
            headers: {},
            expiresAt: '2025-06-01T12:15:00Z',
          },
          {
            imageId: 'image-1',
            fileId: 'f1',
            uploadUrl: 'https://presigned.example.com/1',
            objectKey: 'key1',
            method: 'PUT',
            headers: {},
            expiresAt: '2025-06-01T12:15:00Z',
          },
        ],
      };
      uploadsService.initUpload.and.resolveTo(retryResponse);
      uploadsService.completeUpload.and.resolveTo(FAKE_RECORD_READY);
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_READY);

      const result = await service.createUpload(request, fakeFiles);

      expect(result.status).toBe('ready');
      // Only the second file should be fetched (first was skipped)
      expect(window.fetch).toHaveBeenCalledTimes(1);
      expect(window.fetch).toHaveBeenCalledWith(
        'https://presigned.example.com/1',
        jasmine.objectContaining({ method: 'PUT' }),
      );
    });

    it('should poll without completing when init already returned finalizing', async () => {
      uploadsService.initUpload.and.resolveTo({ ...FAKE_INIT_RESPONSE, status: 'finalizing' });
      uploadsService.getUpload.and.returnValues(
        Promise.resolve(FAKE_DETAIL_FINALIZING),
        Promise.resolve(FAKE_DETAIL_READY),
      );

      const result = await service.createUpload(request, fakeFiles);

      expect(result.status).toBe('ready');
      expect(uploadsService.completeUpload).not.toHaveBeenCalled();
      expect(window.fetch).not.toHaveBeenCalled();
    });

    it('should return the existing upload when init already returned ready', async () => {
      uploadsService.initUpload.and.resolveTo({ ...FAKE_INIT_RESPONSE, status: 'ready' });
      uploadsService.getUpload.and.resolveTo(FAKE_DETAIL_READY);

      const result = await service.createUpload(request, fakeFiles);

      expect(result.status).toBe('ready');
      expect(uploadsService.completeUpload).not.toHaveBeenCalled();
      expect(window.fetch).not.toHaveBeenCalled();
    });
  });
});

describe('UploadCreateService polling request deadlines', () => {
  let service: UploadCreateService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UploadCreateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  for (const completedPolls of [0, 4]) {
    it(`cancels a stalled status request after ${completedPolls ? 'the remaining polling budget' : '5 seconds'}`, fakeAsync(() => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const failed = jasmine.createSpy('failed');
      const initialized = jasmine.createSpy('initialized').and.resolveTo();
      void service
        .createUpload(
          {
            clientUploadId: 'client-1',
            propertyId: 'p1',
            talhaoId: 't1',
            cropTypeId: 'c1',
            source: 'phone',
            activityDate: '2025-06-01T12:00:00Z',
            files: [
              {
                imageId: 'image-0',
                contentType: file.type,
                sizeBytes: file.size,
                latitude: -15.5,
                longitude: -47.5,
              },
            ],
          },
          [file],
          undefined,
          { userId: 'u1', assertIdentity: () => undefined, onInitialized: initialized },
        )
        .catch(failed);
      http.expectOne('/api/uploads/init').flush({
        ...FAKE_INIT_RESPONSE,
        status: 'finalizing',
        files: [FAKE_INIT_RESPONSE.files[0]],
      });
      flushMicrotasks();

      for (let i = 0; i < completedPolls; i++) {
        const poll = http.expectOne('/api/uploads/upload-1');
        tick(4500);
        poll.flush(FAKE_DETAIL_FINALIZING);
        tick(2000);
      }

      const stalled = http.expectOne('/api/uploads/upload-1');
      expect(stalled.request.context.get(EXPECTED_USER_ID)).toBe('u1');
      expect(initialized).toHaveBeenCalledOnceWith('upload-1');
      const remaining = completedPolls ? 4000 : 5000;
      tick(remaining - 1);
      expect(stalled.cancelled).toBeFalse();
      expect(failed).not.toHaveBeenCalled();
      tick(1);
      expect(stalled.cancelled).toBeTrue();
      expect(failed).toHaveBeenCalledOnceWith(jasmine.objectContaining({ name: 'TimeoutError' }));
      tick(60000);
      http.expectNone('/api/uploads/upload-1');
    }));
  }
});
