import { TestBed } from '@angular/core/testing';

import { OfflineCatalogCacheService } from './offline-catalog-cache.service';
import { AuthService } from './auth.service';
import { UserPublic, UserRole } from '@agrolens/contracts';
import { CatalogsService } from './catalogs.service';

describe('OfflineCatalogCacheService', () => {
  let service: OfflineCatalogCacheService;
  let catalogsService: jasmine.SpyObj<CatalogsService>;
  const user: UserPublic = {
    id: 'user-1',
    fullName: 'Test User',
    role: 'user',
    email: 'test@example.com',
  };
  const catalogs = {
    properties: [],
    talhoes: [],
    cropTypes: [],
    estadios: [],
  };

  beforeEach(() => {
    catalogsService = jasmine.createSpyObj('CatalogsService', [
      'listProperties',
      'listTalhoes',
      'listCropTypes',
      'listEstadios',
    ]);
    catalogsService.listProperties.and.resolveTo([]);
    catalogsService.listTalhoes.and.resolveTo([]);
    catalogsService.listCropTypes.and.resolveTo([]);
    catalogsService.listEstadios.and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        OfflineCatalogCacheService,
        {
          provide: AuthService,
          useValue: {
            user: () => user,
            offlineSession: () => false,
            assertIdentity: () => undefined,
          },
        },
        { provide: CatalogsService, useValue: catalogsService },
      ],
    });
    service = TestBed.inject(OfflineCatalogCacheService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('saves and loads catalogs for the current user', () => {
    service.save(catalogs);
    expect(service.load()).toEqual(catalogs);
  });

  it('clears catalogs for the current user', () => {
    service.save(catalogs);
    service.clear();
    expect(service.load()).toBeNull();
  });

  it('returns null when stored JSON is invalid', () => {
    localStorage.setItem('agrolens:offline-catalogs:user-1', '{not-json');
    expect(service.load()).toBeNull();
  });

  it('rejects a valid JSON cache with missing catalogs', () => {
    localStorage.setItem('agrolens:offline-catalogs:user-1', '{"properties":[]}');
    expect(service.load()).toBeNull();
    expect(service.available()).toBeFalse();
  });

  it('prepares all four catalogs without visiting the upload form', async () => {
    await service.refresh();
    expect(catalogsService.listProperties).toHaveBeenCalled();
    expect(catalogsService.listTalhoes).toHaveBeenCalled();
    expect(catalogsService.listCropTypes).toHaveBeenCalled();
    expect(catalogsService.listEstadios).toHaveBeenCalled();
    expect(service.load()).toEqual(catalogs);
    expect(service.savedAt()).not.toBeNull();
  });

  it('uses a complete saved cache offline without network requests', async () => {
    service.save(catalogs);
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    expect(await service.refresh()).toEqual(catalogs);
    expect(catalogsService.listProperties).not.toHaveBeenCalled();
  });

  it('preserves the previous complete snapshot when one catalog refresh fails', async () => {
    service.save(catalogs);
    const savedAt = service.savedAt();
    catalogsService.listEstadios.and.rejectWith(new Error('Unavailable'));
    await expectAsync(service.refresh()).toBeRejected();
    expect(service.load()).toEqual(catalogs);
    expect(service.savedAt()).toBe(savedAt);
  });
});
