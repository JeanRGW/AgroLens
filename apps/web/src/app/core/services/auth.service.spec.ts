import { HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionIdentityError } from '../interceptors/auth-context';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService online sessions', () => {
  let service: AuthService;
  let api: jasmine.SpyObj<ApiService>;
  let session: SessionService;
  let router: jasmine.SpyObj<Router>;
  const user = { id: 'u', email: 'u@test', fullName: 'User', role: 'user' };

  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['get', 'post']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        SessionService,
        { provide: ApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AuthService);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    localStorage.removeItem('agrolens:offline-user');
    localStorage.removeItem('agrolens:session-change');
  });

  async function login() {
    api.post.and.returnValue(of({ accessToken: 'token', user }));
    await service.login('u@test', 'password');
  }

  it('sets an in-memory user and token without persisting identity', async () => {
    await login();
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'u@test',
      password: 'password',
      clientType: 'web',
    });
    expect(service.user()?.id).toBe('u');
    expect(session.token).toBe('token');
    expect(service.isAuthenticated()).toBeTrue();
    expect(localStorage.getItem('agrolens:offline-user')).toBeNull();
  });

  it('registers with the web auth contract', async () => {
    api.post.and.returnValue(of({ accessToken: 'token', user }));
    await service.register('u@test', 'User', 'password', '123');
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      email: 'u@test',
      fullName: 'User',
      password: 'password',
      phone: '123',
      clientType: 'web',
    });
    expect(service.user()?.id).toBe('u');
  });

  it('does not authenticate failed logins', async () => {
    api.post.and.returnValue(throwError(() => new Error('Invalid credentials')));
    await expectAsync(service.login('u@test', 'wrong')).toBeRejectedWithError(
      'Invalid credentials',
    );
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('restores the session from the cookie and validates /me before exposing its token', async () => {
    api.post.and.returnValue(of({ accessToken: 'fresh' }));
    api.get.and.callFake(() => {
      expect(session.token).toBeNull();
      return of({ user: { ...user, role: 'admin' } }) as never;
    });
    const [first, second] = await Promise.all([service.initialize(), service.initialize()]);
    expect(first).toEqual(second);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(session.token).toBe('fresh');
    expect(service.isAdmin()).toBeTrue();
  });

  it('ignores a legacy cached identity after refresh expiry', async () => {
    localStorage.setItem('agrolens:offline-user', JSON.stringify(user));
    api.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    expect(await service.initialize()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
  });

  [0, 500].forEach((status) => {
    it(`does not restore a legacy identity after refresh failure ${status}`, async () => {
      localStorage.setItem('agrolens:offline-user', JSON.stringify(user));
      const error = new HttpErrorResponse({ status });
      api.post.and.returnValue(throwError(() => error));
      await expectAsync(service.initialize()).toBeRejectedWith(error);
      expect(service.user()).toBeNull();
      expect(service.loading()).toBeFalse();
    });
  });

  it('rejects another account before exposing a refreshed token', async () => {
    await login();
    api.post.and.returnValue(of({ accessToken: 'other' }));
    api.get.and.returnValue(of({ user: { ...user, id: 'other' } }));
    await expectAsync(service.refreshSession('u')).toBeRejectedWithError(SessionIdentityError);
    expect(service.user()).toBeNull();
    expect(session.token).toBeNull();
  });

  it('does not return a token when /me rejects the refreshed session', async () => {
    api.post.and.returnValue(of({ accessToken: 'rejected' }));
    api.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    expect(await service.refreshSession()).toBeNull();
    expect(session.token).toBeNull();
  });

  [401, 403].forEach((status) => {
    it(`clears identity and admin access when /me returns ${status}`, async () => {
      await login();
      api.get.and.returnValue(throwError(() => new HttpErrorResponse({ status })));
      expect(await service.refreshClaims()).toBeFalse();
      expect(service.user()).toBeNull();
      expect(session.token).toBeNull();
    });
  });

  it('refreshes changed claims from /me', async () => {
    await login();
    api.get.and.returnValue(of({ user: { ...user, role: 'admin' } }));
    expect(await service.refreshClaims()).toBeTrue();
  });

  it('clears the local session even when server logout fails', async () => {
    await login();
    api.post.and.returnValue(throwError(() => new Error('Offline')));
    await service.logout();
    expect(service.user()).toBeNull();
    expect(session.token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('invalidates the session when another Angular tab changes accounts', async () => {
    await login();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'agrolens:session-change', newValue: 'other' }),
    );
    expect(service.user()).toBeNull();
    expect(session.token).toBeNull();
    expect(() => service.assertIdentity('u')).toThrowError(SessionIdentityError);
  });

  ['refresh', 'me'].forEach((endpoint) => {
    it(`terminates a disabled account reported by ${endpoint}`, async () => {
      await login();
      const error = new HttpErrorResponse({ status: 401, error: { code: 'account_disabled' } });
      if (endpoint === 'refresh') {
        api.post.and.returnValue(throwError(() => error));
        expect(await service.refreshSession()).toBeNull();
      } else {
        api.get.and.returnValue(throwError(() => error));
        expect(await service.refreshClaims()).toBeFalse();
      }
      expect(service.user()).toBeNull();
      expect(service.accountDisabled()).toBeTrue();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'disabled' },
      });
      await login();
      expect(service.accountDisabled()).toBeFalse();
    });
  });
});
