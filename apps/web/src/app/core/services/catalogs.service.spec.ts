import { TestBed } from '@angular/core/testing';

import { CatalogsService } from './catalogs.service';
import { ApiService } from './api.service';

describe('CatalogsService', () => {
  let service: CatalogsService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CatalogsService,
        {
          provide: ApiService,
          useValue: jasmine.createSpyObj('ApiService', [
            'get',
            'post',
            'patch',
            'delete',
            'getJson',
            'postJson',
            'patchJson',
            'deleteJson',
          ]),
        },
      ],
    });

    service = TestBed.inject(CatalogsService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('properties', () => {
    it('getProperty unwraps the property envelope', async () => {
      const property = { id: 'p1', name: 'Fazenda' };
      api.getJson.and.resolveTo({ property });
      const result = await service.getProperty('p1');
      expect(api.getJson).toHaveBeenCalledWith('/properties/p1');
      expect(result).toEqual(jasmine.objectContaining(property));
    });

    it('listProperties calls GET /properties', async () => {
      api.getJson.and.resolveTo({ properties: [{ id: 'p1', name: 'Fazenda' }] });
      const result = await service.listProperties();
      expect(api.getJson).toHaveBeenCalledWith('/properties', undefined, undefined, 10000);
      expect(result).toEqual([{ id: 'p1', name: 'Fazenda' } as any]);
    });

    it('createProperty calls POST /properties with data', async () => {
      const mock = {
        id: 'p1',
        name: 'Fazenda',
        owner: 'João',
        userId: 'u1',
        address: 'Rua X',
        latitude: -23,
        longitude: -46,
        createdAt: '2025-01-01T00:00:00Z',
      };
      api.postJson.and.resolveTo({ property: mock });
      const result = await service.createProperty({
        name: 'Fazenda',
        owner: 'João',
        address: 'Rua X',
        latitude: -23,
        longitude: -46,
      });
      expect(api.postJson).toHaveBeenCalledWith('/properties', {
        name: 'Fazenda',
        owner: 'João',
        address: 'Rua X',
        latitude: -23,
        longitude: -46,
      });
      expect(result.id).toBe('p1');
    });

    it('updateProperty calls PATCH /properties/:id', async () => {
      api.patchJson.and.resolveTo({ property: { id: 'p1' } });
      await service.updateProperty('p1', { name: 'Updated' });
      expect(api.patchJson).toHaveBeenCalledWith('/properties/p1', { name: 'Updated' });
    });

    it('deleteProperty calls DELETE /properties/:id', async () => {
      api.deleteJson.and.resolveTo(undefined);
      await service.deleteProperty('p1');
      expect(api.deleteJson).toHaveBeenCalledWith('/properties/p1');
    });
  });

  describe('talhoes', () => {
    it('getTalhao unwraps the talhao envelope', async () => {
      const talhao = { id: 't1', name: 'Norte' };
      api.getJson.and.resolveTo({ talhao });
      const result = await service.getTalhao('t1');
      expect(api.getJson).toHaveBeenCalledWith('/talhoes/t1');
      expect(result).toEqual(jasmine.objectContaining(talhao));
    });

    it('listTalhoes passes propertyId param', async () => {
      api.getJson.and.resolveTo({ talhoes: [{ id: 't1', name: 'Norte' }] });
      const result = await service.listTalhoes('prop-1');
      expect(api.getJson).toHaveBeenCalledWith(
        '/talhoes',
        { propertyId: 'prop-1' },
        undefined,
        10000,
      );
      expect(result).toEqual([{ id: 't1', name: 'Norte' } as any]);
    });

    it('listTalhoes without propertyId omits param', async () => {
      api.getJson.and.resolveTo({ talhoes: [] });
      await service.listTalhoes();
      expect(api.getJson).toHaveBeenCalledWith('/talhoes', {}, undefined, 10000);
    });

    it('createTalhao calls POST /talhoes', async () => {
      const mock = {
        id: 't1',
        name: 'Norte',
        propertyId: 'p1',
        userId: 'u1',
        createdAt: '2025-01-01T00:00:00Z',
      };
      api.postJson.and.resolveTo({ talhao: mock });
      const result = await service.createTalhao({ name: 'Norte', propertyId: 'p1' });
      expect(api.postJson).toHaveBeenCalledWith('/talhoes', {
        name: 'Norte',
        propertyId: 'p1',
      });
      expect(result.id).toBe('t1');
    });

    it('updateTalhao calls PATCH /talhoes/:id', async () => {
      api.patchJson.and.resolveTo({ talhao: { id: 't1' } });
      await service.updateTalhao('t1', { name: 'Sul' });
      expect(api.patchJson).toHaveBeenCalledWith('/talhoes/t1', { name: 'Sul' });
    });

    it('deleteTalhao calls DELETE /talhoes/:id', async () => {
      api.deleteJson.and.resolveTo(undefined);
      await service.deleteTalhao('t1');
      expect(api.deleteJson).toHaveBeenCalledWith('/talhoes/t1');
    });
  });

  describe('crop types', () => {
    it('getCropType unwraps the cropType envelope', async () => {
      const cropType = { id: 'c1', name: 'Soja' };
      api.getJson.and.resolveTo({ cropType });
      const result = await service.getCropType('c1');
      expect(api.getJson).toHaveBeenCalledWith('/crop-types/c1');
      expect(result).toEqual(jasmine.objectContaining(cropType));
    });

    it('listCropTypes calls GET /crop-types', async () => {
      api.getJson.and.resolveTo({ cropTypes: [{ id: 'c1', name: 'Soja' }] });
      const result = await service.listCropTypes();
      expect(api.getJson).toHaveBeenCalledWith('/crop-types', undefined, undefined, 10000);
      expect(result).toEqual([{ id: 'c1', name: 'Soja' } as any]);
    });

    it('createCropType calls POST /crop-types', async () => {
      api.postJson.and.resolveTo({
        cropType: { id: 'c1', name: 'Soja', userId: 'u1', createdAt: '2025-01-01T00:00:00Z' },
      });
      await service.createCropType({ name: 'Soja' });
      expect(api.postJson).toHaveBeenCalledWith('/crop-types', { name: 'Soja' });
    });

    it('deleteCropType calls DELETE /crop-types/:id', async () => {
      api.deleteJson.and.resolveTo(undefined);
      await service.deleteCropType('c1');
      expect(api.deleteJson).toHaveBeenCalledWith('/crop-types/c1');
    });
  });

  describe('estadios', () => {
    it('getEstadio unwraps the estadio envelope', async () => {
      const estadio = { id: 'e1', name: 'Vegetativo' };
      api.getJson.and.resolveTo({ estadio });
      const result = await service.getEstadio('e1');
      expect(api.getJson).toHaveBeenCalledWith('/estadios/e1');
      expect(result).toEqual(jasmine.objectContaining(estadio));
    });

    it('listEstadios passes cropTypeId param', async () => {
      api.getJson.and.resolveTo({ estadios: [{ id: 'e1', name: 'Vegetativo' }] });
      const result = await service.listEstadios('crop-1');
      expect(api.getJson).toHaveBeenCalledWith(
        '/estadios',
        { cropTypeId: 'crop-1' },
        undefined,
        10000,
      );
      expect(result).toEqual([{ id: 'e1', name: 'Vegetativo' } as any]);
    });

    it('listEstadios without cropTypeId omits param', async () => {
      api.getJson.and.resolveTo({ estadios: [] });
      await service.listEstadios();
      expect(api.getJson).toHaveBeenCalledWith('/estadios', {}, undefined, 10000);
    });

    it('createEstadio calls POST /estadios', async () => {
      api.postJson.and.resolveTo({
        estadio: {
          id: 'e1',
          name: 'Vegetativo',
          cropTypeId: 'c1',
          userId: 'u1',
          createdAt: '2025-01-01T00:00:00Z',
        },
      });
      await service.createEstadio({ name: 'Vegetativo', cropTypeId: 'c1' });
      expect(api.postJson).toHaveBeenCalledWith('/estadios', {
        name: 'Vegetativo',
        cropTypeId: 'c1',
      });
    });

    it('deleteEstadio calls DELETE /estadios/:id', async () => {
      api.deleteJson.and.resolveTo(undefined);
      await service.deleteEstadio('e1');
      expect(api.deleteJson).toHaveBeenCalledWith('/estadios/e1');
    });
  });
});
