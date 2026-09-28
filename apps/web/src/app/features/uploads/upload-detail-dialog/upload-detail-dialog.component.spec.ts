import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UploadDetailDialogComponent } from './upload-detail-dialog.component';
import { UploadsService } from '../../../core/services/uploads.service';
import { AuthService } from '../../../core/services/auth.service';
import { DisplayUrlsResponse, UploadDetail } from '../../../shared/models/upload-record';

function makeDetail(): UploadDetail {
  return {
    id: 'upload-1',
    clientUploadId: 'client-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    talhaoId: 'tal-1',
    cropTypeId: 'crop-1',
    source: 'drone',
    status: 'ready',
    estadioId: null,
    activityDate: '2026-01-01T00:00:00Z',
    errorMessage: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    files: [
      {
        id: 'f0',
        imageId: 'image-0',
        latitude: -15,
        longitude: -47,
        variant: 'original',
        objectKey: 'k0',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        width: 10,
        height: 10,

        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'fp0',
        imageId: 'image-0',
        latitude: -15,
        longitude: -47,
        variant: 'preview',
        objectKey: 'kp0',
        contentType: 'image/webp',
        sizeBytes: 512,
        width: 5,
        height: 5,

        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'f1',
        imageId: 'image-1',
        latitude: null,
        longitude: null,
        variant: 'original',
        objectKey: 'k1',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        width: 10,
        height: 10,

        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function batchResponse(): DisplayUrlsResponse {
  return {
    files: {
      fp0: {
        fileId: 'fp0',
        variant: 'preview' as const,
        url: 'https://example.com/preview-0',
      },
      f1: {
        fileId: 'f1',
        variant: 'original' as const,
        url: 'https://example.com/original-1',
      },
    },
  };
}

describe('UploadDetailDialogComponent', () => {
  let fixture: ComponentFixture<UploadDetailDialogComponent>;
  let component: UploadDetailDialogComponent;
  let uploadsService: jasmine.SpyObj<UploadsService>;

  const authMock = {
    user: signal<{ id: string; role: string } | null>({ id: 'user-1', role: 'admin' }),
    isAdmin: computed(() => true),
  };

  function setup(displayUrlsResponse = batchResponse(), detail = makeDetail()): void {
    const uploadsSpy = jasmine.createSpyObj<UploadsService>('UploadsService', [
      'getUpload',
      'getDisplayUrls',
      'getPreviewUrl',
      'getDownloadUrl',
      'deleteUpload',
    ]);
    uploadsSpy.getUpload.and.resolveTo(detail);
    uploadsSpy.getDisplayUrls.and.resolveTo(displayUrlsResponse);
    uploadsSpy.getPreviewUrl.and.resolveTo({
      uploadId: 'upload-1',
      fileId: 'fp0',
      imageId: 'image-0',
      fileName: '0.webp',
      contentType: 'image/webp',
      sizeBytes: 512,
      downloadUrl: 'https://example.com/preview-0',
      expiresAt: '2026-01-01T12:00:00Z',
    });
    uploadsSpy.getDownloadUrl.and.resolveTo({ downloadUrl: 'https://example.com/dl' });

    TestBed.configureTestingModule({
      imports: [UploadDetailDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: UploadsService, useValue: uploadsSpy },
        { provide: AuthService, useValue: authMock },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open']),
        },
        { provide: MAT_DIALOG_DATA, useValue: { uploadId: 'upload-1' } },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) },
      ],
    });

    fixture = TestBed.createComponent(UploadDetailDialogComponent);
    component = fixture.componentInstance;
    uploadsService = TestBed.inject(UploadsService) as jasmine.SpyObj<UploadsService>;
    fixture.detectChanges();
  }

  it('should resolve all display URLs in a single batch call on open', waitForAsync(() => {
    setup();
    fixture.whenStable().then(() => {
      expect(uploadsService.getUpload).toHaveBeenCalledTimes(1);
      expect(uploadsService.getDisplayUrls).toHaveBeenCalledTimes(1);
      expect(uploadsService.getDisplayUrls).toHaveBeenCalledWith('upload-1');
      // No per-image single-file URL requests should fire on open.
      expect(uploadsService.getPreviewUrl).not.toHaveBeenCalled();
      expect(uploadsService.getDownloadUrl).not.toHaveBeenCalled();
    });
  }));

  it('should populate resolved URLs for every display entry from the batch', waitForAsync(() => {
    setup();
    fixture.whenStable().then(() => {
      const urls = component.resolvedUrls();
      expect(urls.get('preview:fp0')).toBe('https://example.com/preview-0');
      expect(urls.get('original:f1')).toBe('https://example.com/original-1');
    });
  }));

  it('should match previews to originals by image ID', waitForAsync(() => {
    const detail = makeDetail();
    detail.files[2].imageId = 'image-2';
    detail.files.push({
      ...detail.files[1],
      id: 'fp2',
      imageId: 'image-2',
      objectKey: 'kp2',
    });
    setup(batchResponse(), detail);
    fixture.whenStable().then(() => {
      expect(component.displayEntries()).toEqual(['preview:fp0', 'preview:fp2']);
    });
  }));

  it('should request a fresh URL when opening the original image', waitForAsync(() => {
    setup();
    fixture.whenStable().then(async () => {
      spyOn(component, 'downloadUrl');

      await component.openOriginal();

      expect(uploadsService.getDownloadUrl).toHaveBeenCalledWith('upload-1', 'f0');
      expect(component.downloadUrl).toHaveBeenCalledWith('https://example.com/dl');
    });
  }));
});
