import { TestBed } from '@angular/core/testing';

import { AuditService } from './audit.service';
import { ApiService } from './api.service';
import { ResourceType } from '@agrolens/contracts';

describe('AuditService', () => {
  let service: AuditService;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'getJson']);

    TestBed.configureTestingModule({
      providers: [AuditService, { provide: ApiService, useValue: apiSpy }],
    });

    service = TestBed.inject(AuditService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('calls GET /audit-events with default page params', async () => {
    api.getJson.and.resolveTo({ items: [], total: 0 });
    await service.listEvents();
    expect(api.getJson).toHaveBeenCalledWith('/audit-events', { page: 1, pageSize: 50 });
  });

  it('passes eventType filter', async () => {
    api.getJson.and.resolveTo({ items: [], total: 0 });
    await service.listEvents({ eventType: 'role_change' });
    expect(api.getJson).toHaveBeenCalledWith('/audit-events', {
      page: 1,
      pageSize: 50,
      eventType: 'role_change',
    });
  });

  it('passes actorUserId filter', async () => {
    api.getJson.and.resolveTo({ items: [], total: 0 });
    await service.listEvents({ actorUserId: 'u1' });
    expect(api.getJson).toHaveBeenCalledWith('/audit-events', {
      page: 1,
      pageSize: 50,
      actorUserId: 'u1',
    });
  });

  it('passes resourceType filter', async () => {
    api.getJson.and.resolveTo({ items: [], total: 0 });
    await service.listEvents({ resourceType: 'property' });
    expect(api.getJson).toHaveBeenCalledWith('/audit-events', {
      page: 1,
      pageSize: 50,
      resourceType: 'property',
    });
  });

  it('passes resourceId filter', async () => {
    api.getJson.and.resolveTo({ items: [], total: 0 });
    await service.listEvents({ resourceId: 'r1' });
    expect(api.getJson).toHaveBeenCalledWith('/audit-events', {
      page: 1,
      pageSize: 50,
      resourceId: 'r1',
    });
  });
});
