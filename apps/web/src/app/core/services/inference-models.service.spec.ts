import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { InferenceModelsService } from './inference-models.service';
import { ApiService } from './api.service';

describe('InferenceModelsService', () => {
  let service: InferenceModelsService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'patch', 'delete']);

    TestBed.configureTestingModule({
      providers: [InferenceModelsService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(InferenceModelsService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initModel', () => {
    it('should POST /admin/inference-models/init', async () => {
      const mockResponse = { id: 'm1', uploadUrl: 'https://example.com/presigned', headers: {} };
      api.post.and.returnValue(of(mockResponse));

      const result = await service.initModel('TestModel', '1.0', 'A test model');
      expect(result).toEqual(mockResponse);
      expect(api.post).toHaveBeenCalledWith('/admin/inference-models/init', {
        name: 'TestModel',
        version: '1.0',
        description: 'A test model',
      });
    });

    it('should omit description when not provided', async () => {
      const mockResponse = { id: 'm1', uploadUrl: 'https://example.com/presigned', headers: {} };
      api.post.and.returnValue(of(mockResponse));

      await service.initModel('TestModel', '1.0');
      expect(api.post).toHaveBeenCalledWith('/admin/inference-models/init', {
        name: 'TestModel',
        version: '1.0',
        description: undefined,
      });
    });
  });

  describe('completeModelUpload', () => {
    it('should POST /admin/inference-models/:id/complete', async () => {
      const mockModel = {
        id: 'm1',
        name: 'Model',
        version: '1',
        task: null,
        classes: [],
        description: null,
        status: 'ready',
        active: true,
        sha256: null,
        sizeBytes: null,
        errorMessage: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.post.and.returnValue(of(mockModel));

      const result = await service.completeModelUpload('m1');
      expect(result).toEqual(mockModel);
      expect(api.post).toHaveBeenCalledWith('/admin/inference-models/m1/complete');
    });
  });

  describe('listModels', () => {
    it('should GET /admin/inference-models', async () => {
      const mockModels = [
        {
          id: 'm1',
          name: 'Model',
          version: '1',
          task: null,
          classes: [],
          description: null,
          status: 'ready',
          active: true,
          sha256: null,
          sizeBytes: null,
          errorMessage: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];
      api.get.and.returnValue(of(mockModels));

      const result = await service.listModels();
      expect(result).toEqual(mockModels);
      expect(api.get).toHaveBeenCalledWith('/admin/inference-models');
    });
  });

  describe('updateModel', () => {
    it('should PATCH /admin/inference-models/:id', async () => {
      const mockModel = {
        id: 'm1',
        name: 'Updated',
        version: '1',
        task: null,
        classes: [],
        description: null,
        status: 'ready',
        active: true,
        sha256: null,
        sizeBytes: null,
        errorMessage: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.patch.and.returnValue(of(mockModel));

      const result = await service.updateModel('m1', { name: 'Updated' });
      expect(result).toEqual(mockModel);
      expect(api.patch).toHaveBeenCalledWith('/admin/inference-models/m1', { name: 'Updated' });
    });

    it('should forward null description so the backend clears it', async () => {
      const mockModel = {
        id: 'm1',
        name: 'Updated',
        version: '1',
        task: null,
        classes: [],
        description: null,
        status: 'ready',
        active: true,
        sha256: null,
        sizeBytes: null,
        errorMessage: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.patch.and.returnValue(of(mockModel));

      const result = await service.updateModel('m1', { name: 'Updated', description: null });
      expect(result).toEqual(mockModel);
      expect(api.patch).toHaveBeenCalledWith('/admin/inference-models/m1', {
        name: 'Updated',
        description: null,
      });
    });
  });

  describe('setModelActive', () => {
    it('should PATCH /admin/inference-models/:id/active', async () => {
      const mockModel = {
        id: 'm1',
        name: 'Model',
        version: '1',
        task: null,
        classes: [],
        description: null,
        status: 'ready',
        active: false,
        sha256: null,
        sizeBytes: null,
        errorMessage: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      api.patch.and.returnValue(of(mockModel));

      const result = await service.setModelActive('m1', false);
      expect(result).toEqual(mockModel);
      expect(api.patch).toHaveBeenCalledWith('/admin/inference-models/m1/active', {
        active: false,
      });
    });
  });

  describe('deleteModel', () => {
    it('should DELETE /admin/inference-models/:id', async () => {
      api.delete.and.returnValue(of(undefined));

      await service.deleteModel('m1');
      expect(api.delete).toHaveBeenCalledWith('/admin/inference-models/m1');
    });
  });
});
