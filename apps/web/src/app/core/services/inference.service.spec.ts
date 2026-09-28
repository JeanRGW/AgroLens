import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { InferenceService } from './inference.service';
import { ApiService } from './api.service';

describe('InferenceService', () => {
  let service: InferenceService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'delete']);

    TestBed.configureTestingModule({
      providers: [InferenceService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(InferenceService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listActiveModels', () => {
    it('should GET /inference/models', async () => {
      const mockModels = [{ id: 'm1', name: 'Model', version: '1', task: null, classes: [] }];
      api.get.and.returnValue(of(mockModels));

      const result = await service.listActiveModels();
      expect(result).toEqual(mockModels);
      expect(api.get).toHaveBeenCalledWith('/inference/models');
    });
  });

  describe('listJobs', () => {
    it('should GET /inference/jobs with default limit/offset', async () => {
      const mockResponse = { jobs: [], total: 0 };
      api.get.and.returnValue(of(mockResponse));

      const result = await service.listJobs();
      expect(result).toEqual(mockResponse);
      expect(api.get).toHaveBeenCalledWith('/inference/jobs', { limit: 20, offset: 0 });
    });

    it('should pass custom limit/offset', async () => {
      const mockResponse = { jobs: [], total: 0 };
      api.get.and.returnValue(of(mockResponse));

      await service.listJobs(10, 5);
      expect(api.get).toHaveBeenCalledWith('/inference/jobs', { limit: 10, offset: 5 });
    });
  });

  describe('getJob', () => {
    it('should GET /inference/jobs/:id', async () => {
      const mockJob = { id: 'j1', status: 'completed', modelId: 'm1' };
      api.get.and.returnValue(of(mockJob));

      const result = await service.getJob('j1');
      expect(result).toEqual(mockJob as any);
      expect(api.get).toHaveBeenCalledWith('/inference/jobs/j1');
    });
  });

  describe('getImage', () => {
    it('should GET /inference/jobs/:id/images/:imageId', async () => {
      const mockImage = {
        id: 'img1',
        imageIndex: 0,
        fileName: 'a.jpg',
        status: 'completed',
        detections: [],
        imageUrl: 'url',
        errorMessage: null,
        width: 800,
        height: 600,
        inferenceMs: 100,
      };
      api.get.and.returnValue(of(mockImage));

      const result = await service.getImage('j1', 'img1');
      expect(result).toEqual(mockImage as any);
      expect(api.get).toHaveBeenCalledWith('/inference/jobs/j1/images/img1');
    });
  });

  describe('createUploadJob', () => {
    it('should POST /inference/jobs with modelId and uploadId', async () => {
      const mockResponse = { id: 'j1', status: 'queued' };
      api.post.and.returnValue(of(mockResponse));

      const result = await service.createUploadJob('m1', 'u1');
      expect(result).toEqual(mockResponse as any);
      expect(api.post).toHaveBeenCalledWith('/inference/jobs', {
        modelId: 'm1',
        uploadId: 'u1',
        imageIds: undefined,
      });
    });

    it('should include imageIds when provided', async () => {
      const mockResponse = { id: 'j1', status: 'queued' };
      api.post.and.returnValue(of(mockResponse));

      await service.createUploadJob('m1', 'u1', ['image-0', 'image-1', 'image-2']);
      expect(api.post).toHaveBeenCalledWith('/inference/jobs', {
        modelId: 'm1',
        uploadId: 'u1',
        imageIds: ['image-0', 'image-1', 'image-2'],
      });
    });
  });

  describe('createTempJob', () => {
    it('should POST /inference/jobs with modelId and files', async () => {
      const mockResponse = { id: 'j1', status: 'uploading' };
      api.post.and.returnValue(of(mockResponse));

      const files = [{ fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 1000 }];
      const result = await service.createTempJob('m1', files);
      expect(result).toEqual(mockResponse as any);
      expect(api.post).toHaveBeenCalledWith('/inference/jobs', { modelId: 'm1', files });
    });
  });

  describe('completeTempJob', () => {
    it('should POST /inference/jobs/:id/complete', async () => {
      api.post.and.returnValue(of({ status: 'queued' }));

      const result = await service.completeTempJob('j1');
      expect(result).toEqual({ status: 'queued' });
      expect(api.post).toHaveBeenCalledWith('/inference/jobs/j1/complete');
    });
  });

  describe('deleteJob', () => {
    it('should DELETE /inference/jobs/:id', async () => {
      api.delete.and.returnValue(of(undefined));

      await service.deleteJob('j1');
      expect(api.delete).toHaveBeenCalledWith('/inference/jobs/j1');
    });
  });
});
