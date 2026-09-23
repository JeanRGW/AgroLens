import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { UserRole } from '@agrolens/contracts';
import { SessionService } from './session.service';
import { of, throwError } from 'rxjs';
import { SessionIdentityError } from '../interceptors/auth-context';

describe('AuthService', () => {
  let service: AuthService;
  let api: jasmine.SpyObj<ApiService>;
  let session: SessionService;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        SessionService,
        { provide: ApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    api = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  afterEach(() => localStorage.removeItem('agrolens:offline-user'));

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize as not authenticated', () => {
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.isAdmin()).toBeFalse();
  });

  describe('login', () => {
    it('should set user and token on successful login', async () => {
      const mockResponse = {
        accessToken: 'test-token',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'user',
        },
      };
      api.post.and.returnValue(of(mockResponse));

      const user = await service.login('test@example.com', 'password');
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password',
        clientType: 'web',
      });
      expect(user.email).toBe('test@example.com');
      expect(user.fullName).toBe('Test User');
      expect(session.token).toBe('test-token');
      expect(service.isAuthenticated()).toBeTrue();
    });

    it('should throw on login error', async () => {
      api.post.and.returnValue(throwError(() => new Error('Invalid credentials')));
      await expectAsync(service.login('test@example.com', 'wrong')).toBeRejectedWithError(
        'Invalid credentials',
      );
      expect(service.isAuthenticated()).toBeFalse();
    });
  });

  describe('register', () => {
    it('should set user and token on successful registration', async () => {
      const mockResponse = {
        accessToken: 'reg-token',
        user: {
          id: 'user-2',
          email: 'new@example.com',
          fullName: 'New User',
          role: 'user',
        },
      };
      api.post.and.returnValue(of(mockResponse));

      const user = await service.register('new@example.com', 'New User', 'password', '123456789');
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        email: 'new@example.com',
        fullName: 'New User',
        password: 'password',
        phone: '123456789',
        clientType: 'web',
      });
      expect(user.email).toBe('new@example.com');
      expect(session.token).toBe('reg-token');
      expect(service.isAuthenticated()).toBeTrue();
    });

    it('should throw on registration error', async () => {
      api.post.and.returnValue(throwError(() => new Error('Email already in use')));
      await expectAsync(service.register('dup@example.com', 'Dup', 'pw', '')).toBeRejectedWithError(
        'Email already in use',
      );
      expect(service.isAuthenticated()).toBeFalse();
    });
  });

  describe('logout', () => {
    it('should clear user and token', async () => {
      api.post.and.returnValue(
        of({ accessToken: 't', user: { id: 'u', email: 'e', fullName: 'n', role: 'user' } }),
      );
      await service.login('e@x.com', 'p');

      expect(service.isAuthenticated()).toBeTrue();
      localStorage.setItem('agrolens:offline-catalogs:u', '{}');

      api.post.and.returnValue(of(void 0));
      await service.logout();

      expect(api.post).toHaveBeenCalledWith('/auth/logout', { clientType: 'web' });
      expect(service.isAuthenticated()).toBeFalse();
      expect(session.token).toBeNull();
      expect(localStorage.getItem('agrolens:offline-catalogs:u')).toBeNull();
    });
  });

  describe('refreshClaims', () => {
    it('refreshes a cached admin user from /auth/me', async () => {
      api.post.and.returnValue(
        of({
          accessToken: 'admin-token',
          user: { id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', role: 'admin' },
        }),
      );
      await service.login('admin@example.com', 'password');

      api.get.and.returnValue(
        of({
          user: { id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', role: 'user' },
        }),
      );

      const isAdmin = await service.refreshClaims();

      expect(api.get).toHaveBeenCalledWith('/auth/me');
      expect(isAdmin).toBeFalse();
      expect(service.user()?.role).toBe('user');
    });

    [401, 403].forEach((status) => {
      it(`preserves offline identity but removes online admin access when /auth/me returns ${status}`, async () => {
        api.post.and.returnValue(
          of({
            accessToken: 'admin-token',
            user: { id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', role: 'admin' },
          }),
        );
        await service.login('admin@example.com', 'password');

        api.get.and.returnValue(
          throwError(() => new HttpErrorResponse({ status, statusText: 'Unauthorized' })),
        );

        const isAdmin = await service.refreshClaims();

        expect(isAdmin).toBeFalse();
        expect(service.user()?.id).toBe('admin-1');
        expect(service.offlineSession()).toBeTrue();
        expect(service.isAdmin()).toBeFalse();
        expect(service.reauthenticationRequired()).toBeTrue();
        expect(session.token).toBeNull();
      });
    });
  });

  describe('initialize', () => {
    it('preserves the last identity and catalogs when the refresh cookie has expired', async () => {
      localStorage.setItem(
        'agrolens:offline-user',
        JSON.stringify({ id: 'owner', fullName: 'Owner', email: 'owner@test', role: 'user' }),
      );
      localStorage.setItem('agrolens:offline-catalogs:owner', '{"properties":[]}');
      api.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

      expect((await service.initialize())?.id).toBe('owner');
      expect(service.offlineSession()).toBeTrue();
      expect(service.reauthenticationRequired()).toBeTrue();
      expect(localStorage.getItem('agrolens:offline-user')).toContain('owner');
      expect(localStorage.getItem('agrolens:offline-catalogs:owner')).not.toBeNull();
      localStorage.removeItem('agrolens:offline-catalogs:owner');
    });

    it('rejects a refreshed token belonging to another account before exposing it', async () => {
      api.post.and.returnValue(
        of({
          accessToken: 'token-a',
          user: { id: 'a', email: 'a@test', fullName: 'A', role: 'user' },
        }),
      );
      await service.login('a@test', 'password');
      api.post.and.returnValue(of({ accessToken: 'token-b' }));
      api.get.and.returnValue(of({ id: 'b', email: 'b@test', fullName: 'B', role: 'user' }));

      await expectAsync(service.refreshSession('a')).toBeRejectedWithError(SessionIdentityError);
      expect(service.user()?.id).toBe('a');
      expect(session.token).toBeNull();
      expect(service.reauthenticationRequired()).toBeTrue();
      expect(JSON.parse(localStorage.getItem('agrolens:offline-user')!).id).toBe('a');
    });

    it('does not return an access token if /me rejects the refreshed session', async () => {
      api.post.and.returnValue(of({ accessToken: 'rejected-token' }));
      api.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
      expect(await service.refreshSession()).toBeNull();
      expect(session.token).toBeNull();
    });
    it('should restore session from refresh cookie and /auth/me', async () => {
      api.post.and.returnValue(of({ accessToken: 'fresh-token' }));
      api.get.and.returnValue(
        of({ user: { id: 'u1', email: 'a@b.com', fullName: 'A B', role: 'admin' } }),
      );
      const user = await service.initialize();
      expect(api.post).toHaveBeenCalledWith('/auth/refresh', { clientType: 'web' });
      expect(session.token).toBe('fresh-token');
      expect(user).not.toBeNull();
      expect(user!.role).toBe('admin');
      expect(service.isAdmin()).toBeTrue();
    });

    it('should share one refresh request across concurrent initialize calls', async () => {
      api.post.and.returnValue(of({ accessToken: 'fresh-token' }));
      api.get.and.returnValue(
        of({ user: { id: 'u1', email: 'a@b.com', fullName: 'A B', role: 'user' } }),
      );

      const [first, second] = await Promise.all([service.initialize(), service.initialize()]);

      expect(first).toEqual(second);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith('/auth/refresh', { clientType: 'web' });
    });

    it('should return null when the refresh session is unauthenticated', async () => {
      api.post.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
      );
      const user = await service.initialize();
      expect(user).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('should surface refresh network failures instead of treating them as logout', async () => {
      const error = new HttpErrorResponse({ status: 0, statusText: 'Network Error' });
      api.post.and.returnValue(throwError(() => error));
      await expectAsync(service.initialize()).toBeRejectedWith(error);
      expect(service.loading()).toBeFalse();
    });

    it('restores the cached user without requesting a refresh while offline', async () => {
      spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
      localStorage.setItem(
        'agrolens:offline-user',
        JSON.stringify({
          id: 'offline-user',
          fullName: 'Offline User',
          role: 'user',
          email: 'offline@test',
        }),
      );

      const user = await service.initialize();

      expect(user?.id).toBe('offline-user');
      expect(service.offlineSession()).toBeTrue();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('restores the cached user when refresh fails with a server error', async () => {
      localStorage.setItem(
        'agrolens:offline-user',
        JSON.stringify({
          id: 'offline-user',
          fullName: 'Offline User',
          role: 'user',
          email: 'offline@test',
        }),
      );
      api.post.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
      );

      const user = await service.initialize();

      expect(user?.id).toBe('offline-user');
      expect(service.offlineSession()).toBeTrue();
    });
  });

  describe('suspended account', () => {
    function disabledError() {
      return new HttpErrorResponse({
        status: 401,
        error: {
          message: 'User account is disabled',
          code: 'account_disabled',
          error: 'Unauthorized',
          statusCode: 401,
        },
      });
    }

    async function loginActiveUser() {
      api.post.and.returnValue(
        of({
          accessToken: 'token',
          user: { id: 'u1', email: 'u@test', fullName: 'U', role: 'user' },
        }),
      );
      await service.login('u@test', 'password');
      localStorage.setItem('agrolens:offline-catalogs:u1', '{}');
    }

    it('terminates the local session when refresh reports a disabled account', async () => {
      await loginActiveUser();
      api.post.and.returnValue(throwError(() => disabledError()));

      expect(await service.refreshSession()).toBeNull();

      expect(service.user()).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
      expect(session.token).toBeNull();
      expect(service.offlineSession()).toBeFalse();
      expect(service.accountDisabled()).toBeTrue();
      expect(service.reauthenticationRequired()).toBeTrue();
      expect(localStorage.getItem('agrolens:offline-user')).toBeNull();
      expect(localStorage.getItem('agrolens:offline-catalogs:u1')).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'disabled' },
      });
    });

    it('terminates the local session when /me reports a disabled account', async () => {
      await loginActiveUser();
      api.get.and.returnValue(throwError(() => disabledError()));

      expect(await service.refreshClaims()).toBeFalse();

      expect(service.user()).toBeNull();
      expect(service.accountDisabled()).toBeTrue();
      expect(service.offlineSession()).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'disabled' },
      });
    });

    it('keeps offline mode for a plain expired refresh without the code', async () => {
      await loginActiveUser();
      api.post.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
      );

      expect(await service.refreshSession()).toBeNull();

      expect(service.user()?.id).toBe('u1');
      expect(service.offlineSession()).toBeTrue();
      expect(service.accountDisabled()).toBeFalse();
      expect(localStorage.getItem('agrolens:offline-user')).not.toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the offline flag when refresh fails with a server error mid-session', async () => {
      await loginActiveUser();
      const serverError = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
      api.post.and.returnValue(throwError(() => serverError));

      await expectAsync(service.refreshSession()).toBeRejectedWith(serverError);

      expect(service.user()?.id).toBe('u1');
      expect(service.offlineSession()).toBeTrue();
      expect(service.accountDisabled()).toBeFalse();
      expect(service.reauthenticationRequired()).toBeFalse();
      expect(localStorage.getItem('agrolens:offline-user')).not.toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('clears the disabled flag on the next successful login', async () => {
      await loginActiveUser();
      api.post.and.returnValue(throwError(() => disabledError()));
      await service.refreshSession();
      expect(service.accountDisabled()).toBeTrue();

      api.post.and.returnValue(
        of({
          accessToken: 'token-2',
          user: { id: 'u2', email: 'v@test', fullName: 'V', role: 'user' },
        }),
      );
      await service.login('v@test', 'password');

      expect(service.accountDisabled()).toBeFalse();
      expect(service.user()?.id).toBe('u2');
    });
  });
});
