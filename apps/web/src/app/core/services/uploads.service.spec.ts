import { TestBed } from '@angular/core/testing';

import { UploadsService } from './uploads.service';
import { ApiService } from './api.service';
import {
  InitUploadRequest,
  UploadMutationRecord,
  UploadSource,
} from '../../shared/models/upload-record';

describe('UploadsService', () => {
  let service: UploadsService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UploadsService,
        {
          provide: ApiService,
          useValue: jasmine.createSpyObj('ApiService', [
            'get',
            'post',
            'delete',
            'patch',
            'getJson',
            'postJson',
            'deleteJson',
            'patchJson',
          ]),
        },
      ],
    });

    service = TestBed.inject(UploadsService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listUploads', () => {
    it('should call API with default limit/offset and map response', async () => {
      api.getJson.and.resolveTo({
        uploads: [
          {
            id: 'u1',
            status: 'ready',
            source: 'drone',
            activityDate: '2025-01-01T00:00:00Z',
            latitude: 0,
            longitude: 0,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            fileCount: 2,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const result = await service.listUploads();
      expect(result.records.length).toBe(1);
      expect(result.total).toBe(1);
      expect(api.getJson).toHaveBeenCalledWith('/uploads', {
        limit: 20,
        offset: 0,
      });
    });

    it('should pass filter params with createdFrom/createdTo', async () => {
      api.getJson.and.resolveTo({ uploads: [], total: 0, limit: 20, offset: 0 });

      await service.listUploads({
        status: 'ready',
        source: 'drone',
        createdFrom: '2025-01-01T00:00:00Z',
      });
      expect(api.getJson).toHaveBeenCalledWith('/uploads', {
        limit: 20,
        offset: 0,
        status: 'ready',
        source: 'drone',
        createdFrom: '2025-01-01T00:00:00Z',
      });
    });
  });

  describe('getDashboardSnapshot', () => {
    it('should call /uploads/dashboard and return snapshot', async () => {
      const mockSnapshot = {
        totalUploads: 42,
        uploadsToday: 3,
        sourceBreakdown: { drone: 10, phone: 30, mixed: 2 },
        recentUploads: [],
        catalogCounts: { properties: 5, talhoes: 10, cropTypes: 8, estadios: 12 },
      };
      api.getJson.and.resolveTo(mockSnapshot);

      const result = await service.getDashboardSnapshot();
      expect(result.totalUploads).toBe(42);
      expect(result.catalogCounts.properties).toBe(5);
      expect(api.getJson).toHaveBeenCalledWith('/uploads/dashboard');
    });
  });

  describe('initUpload', () => {
    it('should POST /uploads/init with request body', async () => {
      const mockResponse = {
        uploadId: 'upload-1',
        status: 'draft',
        files: [
          {
            imageIndex: 0,
            fileId: 'f0',
            uploadUrl: 'https://example.com/upload',
            objectKey: 'key',
            method: 'PUT',
            headers: {},
            expiresAt: '2025-06-01T12:15:00Z',
          },
        ],
      };
      api.postJson.and.resolveTo(mockResponse);

      const request: InitUploadRequest = {
        clientUploadId: 'client-1',
        propertyId: 'prop-1',
        talhaoId: 'tal-1',
        cropTypeId: 'crop-1',
        source: 'phone',
        activityDate: '2025-06-01T12:00:00Z',
        latitude: -15.5,
        longitude: -47.5,
        files: [{ fileName: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 1024 }],
      };

      const result = await service.initUpload(request);
      expect(result.uploadId).toBe('upload-1');
      expect(result.files.length).toBe(1);
      expect(result.files[0].uploadUrl).toBe('https://example.com/upload');
      expect(api.postJson).toHaveBeenCalledWith('/uploads/init', request, undefined, 20000);
      expect(request.files[0]).toEqual({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      });
    });
  });

  describe('completeUpload', () => {
    it('should POST /uploads/:id/complete and unwrap upload from response', async () => {
      api.postJson.and.resolveTo({
        upload: {
          id: 'u1',
          clientUploadId: 'client-1',
          userId: 'user-1',
          propertyId: 'property-1',
          talhaoId: 'talhao-1',
          cropTypeId: 'crop-1',
          estadioId: null,
          source: 'phone' as UploadSource,
          status: 'finalizing',
          activityDate: '2025-01-01T00:00:00Z',
          latitude: 0,
          longitude: 0,
          errorMessage: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
        },
      });
      const result = await service.completeUpload('upload-1');
      expect(result.id).toBe('u1');
      expect(result.status).toBe('finalizing');
      expect(api.postJson).toHaveBeenCalledWith(
        '/uploads/upload-1/complete',
        undefined,
        undefined,
        20000,
      );
    });
  });

  describe('deleteUpload', () => {
    it('should DELETE /uploads/:id and unwrap the upload', async () => {
      const upload: UploadMutationRecord = {
        id: 'u1',
        clientUploadId: 'client-1',
        userId: 'user-1',
        propertyId: 'property-1',
        talhaoId: 'talhao-1',
        cropTypeId: 'crop-1',
        estadioId: null,
        source: 'phone',
        status: 'ready',
        activityDate: '2025-01-01T00:00:00Z',
        latitude: 0,
        longitude: 0,
        errorMessage: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deletedAt: '2025-01-02T00:00:00Z',
      };
      api.deleteJson.and.resolveTo({ upload });
      const result = await service.deleteUpload('upload-1');
      expect(result).toEqual(upload);
      expect(api.deleteJson).toHaveBeenCalledWith('/uploads/upload-1');
    });
  });

  describe('getExportDownloadUrls', () => {
    it('should POST /uploads/export-download-urls', async () => {
      const mockResponse = [
        {
          uploadId: 'u1',
          fileId: 'f1',
          imageIndex: 0,
          fileName: 'img.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
          downloadUrl: 'https://example.com/dl',
          expiresAt: '2025-01-01T00:00:00Z',
        },
      ];
      api.postJson.and.resolveTo(mockResponse);

      const result = await service.getExportDownloadUrls([{ uploadId: 'u1', fileId: 'f1' }]);
      expect(result.length).toBe(1);
      expect(result[0].downloadUrl).toBe('https://example.com/dl');
      expect(api.postJson).toHaveBeenCalledWith('/uploads/export-download-urls', {
        files: [{ uploadId: 'u1', fileId: 'f1' }],
      });
    });
  });

  describe('getUpload', () => {
    it('should GET /uploads/:id', async () => {
      api.getJson.and.resolveTo({ id: 'upload-1' });
      await service.getUpload('upload-1');
      expect(api.getJson).toHaveBeenCalledWith('/uploads/upload-1', undefined, undefined, 20000);
    });
  });

  describe('getDownloadUrl', () => {
    it('should GET download URL endpoint', async () => {
      api.getJson.and.resolveTo({ downloadUrl: 'https://example.com/signed' });
      await service.getDownloadUrl('u1', 'f1');
      expect(api.getJson).toHaveBeenCalledWith('/uploads/u1/files/f1/download-url');
    });
  });

  describe('getPreviewUrl', () => {
    it('should GET preview URL endpoint', async () => {
      const mockResponse = {
        uploadId: 'u1',
        fileId: 'f-preview',
        imageIndex: 0,
        fileName: 'preview.webp',
        contentType: 'image/webp',
        sizeBytes: 5120,
        downloadUrl: 'https://example.com/preview-signed',
        expiresAt: '2025-06-01T12:30:00Z',
      };
      api.getJson.and.resolveTo(mockResponse);

      const result = await service.getPreviewUrl('u1', 'f-preview');
      expect(result.downloadUrl).toBe('https://example.com/preview-signed');
      expect(result.fileId).toBe('f-preview');
      expect(result.contentType).toBe('image/webp');
      expect(api.getJson).toHaveBeenCalledWith('/uploads/u1/files/f-preview/preview-url');
    });
  });

  describe('getDisplayUrls', () => {
    it('should GET /uploads/:id/display-urls and map all files at once', async () => {
      const mockResponse = {
        files: {
          'f0-original': {
            fileId: 'f0-original',
            variant: 'original',
            url: 'https://example.com/original-signed',
          },
          'f0-preview': {
            fileId: 'f0-preview',
            variant: 'preview',
            url: 'https://example.com/preview-signed',
          },
        },
      };
      api.getJson.and.resolveTo(mockResponse);

      const result = await service.getDisplayUrls('u1');
      expect(Object.keys(result.files).length).toBe(2);
      expect(result.files['f0-original'].url).toBe('https://example.com/original-signed');
      expect(result.files['f0-preview'].variant).toBe('preview');
      expect(api.getJson).toHaveBeenCalledWith('/uploads/u1/display-urls');
    });
  });
});
