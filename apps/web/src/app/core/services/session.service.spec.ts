import { TestBed } from '@angular/core/testing';

import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
  });

  it('should start with no token', () => {
    expect(service.token).toBeNull();
  });

  it('should store and clear token', () => {
    service.setToken('access-123');
    expect(service.token).toBe('access-123');

    service.clear();
    expect(service.token).toBeNull();
  });

  it('should handle refresh promise', () => {
    const p = Promise.resolve('new-token');
    service.setRefreshPromise(p);
    expect(service.getRefreshPromise()).toBe(p);
  });
});
