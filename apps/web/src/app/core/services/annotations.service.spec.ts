import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AnnotationsService } from './annotations.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';

describe('AnnotationsService', () => {
  let service: AnnotationsService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'put']);

    TestBed.configureTestingModule({
      providers: [AnnotationsService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(AnnotationsService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listUploadAnnotations', () => {
    it('should GET /uploads/:uploadId/annotations', async () => {
      const mockAnnotations = [
        {
          id: 'ann-1',
          imageId: 'image-0',
          imageWidth: 1920,
          imageHeight: 1080,
          classes: ['class-a'],
          labels: [],
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];
      api.get.and.returnValue(of(mockAnnotations));

      const result = await service.listUploadAnnotations('upload-1');
      expect(result.length).toBe(1);
      expect(api.get).toHaveBeenCalledWith('/uploads/upload-1/annotations');
    });
  });

  describe('getAnnotation', () => {
    it('should GET annotation by uploadId and imageId', async () => {
      const mockAnnotation = {
        id: 'ann-1',
        imageId: 'image-2',
        imageWidth: 1920,
        imageHeight: 1080,
        classes: ['class-a'],
        labels: [],
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.get.and.returnValue(of(mockAnnotation));

      const result = await service.getAnnotation('upload-1', 'image-2');
      expect(result).toEqual(mockAnnotation);
      expect(api.get).toHaveBeenCalledWith('/uploads/upload-1/annotations/image-2');
    });

    it('should return null on 404', async () => {
      api.get.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
      );

      const result = await service.getAnnotation('upload-1', 'image-99');
      expect(result).toBeNull();
    });

    it('should reject on non-404 errors', async () => {
      const error = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
      api.get.and.returnValue(throwError(() => error));

      await expectAsync(service.getAnnotation('upload-1', 'image-99')).toBeRejectedWith(error);
    });

    it('should reject network errors', async () => {
      const error = new Error('Network failure');
      api.get.and.returnValue(throwError(() => error));

      await expectAsync(service.getAnnotation('upload-1', 'image-99')).toBeRejectedWith(error);
    });
  });

  describe('upsertAnnotation', () => {
    it('should PUT annotation', async () => {
      const input = {
        imageId: 'image-0',
        imageWidth: 1920,
        imageHeight: 1080,
        classes: ['class-a'],
        labels: [
          { classId: 0, className: 'class-a', xCenter: 0.5, yCenter: 0.5, width: 0.1, height: 0.1 },
        ],
      };
      const mockResponse = {
        ...input,
        id: 'ann-1',
        updatedByUserId: 'usr1',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.put.and.returnValue(of(mockResponse));

      const result = await service.upsertAnnotation('upload-1', input);
      expect(result.imageId).toBe('image-0');
      expect(api.put).toHaveBeenCalledWith('/uploads/upload-1/annotations/image-0', input);
    });
  });

  describe('listUploadAnnotationsBatch', () => {
    it('should fetch annotations for multiple uploads in parallel', async () => {
      const mockAnnotations1 = [
        {
          id: 'ann-1',
          imageId: 'image-0',
          imageWidth: 1920,
          imageHeight: 1080,
          classes: ['class-a'],
          labels: [],
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];
      const mockAnnotations2 = [
        {
          id: 'ann-2',
          imageId: 'image-0',
          imageWidth: 1920,
          imageHeight: 1080,
          classes: ['class-b'],
          labels: [],
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      api.get.and.callFake(<T>(path: string): import('rxjs').Observable<T> => {
        if (path === '/uploads/u1/annotations') return of(mockAnnotations1 as T);
        if (path === '/uploads/u2/annotations') return of(mockAnnotations2 as T);
        return of([] as T);
      });

      const result = await service.listUploadAnnotationsBatch(['u1', 'u2']);
      expect(result.size).toBe(2);
      expect(result.get('u1')!.length).toBe(1);
      expect(result.get('u2')!.length).toBe(1);
    });

    it('should abort export preparation when annotations cannot be loaded', async () => {
      const error = new HttpErrorResponse({ status: 503 });
      api.get.and.callFake(<T>(path: string): import('rxjs').Observable<T> => {
        if (path === '/uploads/u1/annotations')
          return of([
            {
              id: 'ann-1',
              imageId: 'image-0',
              imageWidth: 1920,
              imageHeight: 1080,
              classes: [],
              labels: [],
              updatedAt: '',
            },
          ] as T);
        return throwError(() => error);
      });

      await expectAsync(service.listUploadAnnotationsBatch(['u1', 'u-missing'])).toBeRejectedWith(
        error,
      );
    });
  });
});
