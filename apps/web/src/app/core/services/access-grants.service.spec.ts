import { TestBed } from '@angular/core/testing';

import { AccessGrantsService } from './access-grants.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { ResourceType } from '@agrolens/contracts';

describe('AccessGrantsService', () => {
  let service: AccessGrantsService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'delete', 'getJson']);

    TestBed.configureTestingModule({
      providers: [AccessGrantsService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(AccessGrantsService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listGrants', () => {
    it('calls GET /access-grants with defaults', async () => {
      api.getJson.and.resolveTo({ items: [], total: 0 });
      await service.listGrants();
      expect(api.getJson).toHaveBeenCalledWith('/access-grants', { page: 1, pageSize: 50 });
    });

    it('passes subjectUserId filter', async () => {
      api.getJson.and.resolveTo({ items: [], total: 0 });
      await service.listGrants({ subjectUserId: 'u1' });
      expect(api.getJson).toHaveBeenCalledWith('/access-grants', {
        page: 1,
        pageSize: 50,
        subjectUserId: 'u1',
      });
    });
  });

  describe('createGrant', () => {
    it('calls POST /access-grants with input', async () => {
      api.post.and.returnValue(
        of({
          grant: {
            id: 'g1',
            subjectUserId: 'u1',
            resourceType: 'property',
            resourceId: 'r1',
            grantedByUserId: 'admin',
            grantedAt: '2025-01-01T00:00:00Z',
          },
        }),
      );
      const result = await service.createGrant({
        subjectUserId: 'u1',
        resourceType: 'property',
        resourceId: 'r1',
        reason: 'test',
      });
      expect(result.id).toBe('g1');
      expect(api.post).toHaveBeenCalledWith('/access-grants', {
        subjectUserId: 'u1',
        resourceType: 'property',
        resourceId: 'r1',
        reason: 'test',
      });
    });
  });

  describe('revokeGrant', () => {
    it('calls DELETE /access-grants/:id', async () => {
      api.delete.and.returnValue(of(void 0));
      await service.revokeGrant('g1');
      expect(api.delete).toHaveBeenCalledWith('/access-grants/g1');
    });
  });
});
