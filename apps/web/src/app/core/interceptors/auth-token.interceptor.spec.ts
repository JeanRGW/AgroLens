import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { authTokenInterceptor } from './auth-token.interceptor';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { EXPECTED_USER_ID, SessionIdentityError } from './auth-context';
import { UserRole } from '@agrolens/contracts';

describe('authTokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionService;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', [
      'refreshSession',
      'user',
      'assertIdentity',
      'accountDisabled',
    ]);
    authSpy.user.and.returnValue(null);
    authSpy.accountDisabled.and.returnValue(false);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        SessionService,
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('token attachment', () => {
    it('adds bearer token to API requests', () => {
      session.setToken('access-token');

      http.get('/api/uploads/dashboard').subscribe();

      const req = httpMock.expectOne('/api/uploads/dashboard');
      expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
      req.flush({});
    });

    it('does not add bearer token to non-API requests', () => {
      session.setToken('access-token');

      http.put('http://localhost:3900/presigned-object', new Blob()).subscribe();

      const req = httpMock.expectOne('http://localhost:3900/presigned-object');
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush(null);
    });

    it('does not add bearer token when session has no token', () => {
      http.get('/api/uploads/dashboard').subscribe();

      const req = httpMock.expectOne('/api/uploads/dashboard');
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush({});
    });
  });

  describe('401 → refresh → retry', () => {
    it('does not replay an old profile mutation after switching accounts', fakeAsync(() => {
      session.setToken('account-a-token');
      authService.user.and.returnValue({
        id: 'a',
        fullName: 'A',
        email: 'a@example.com',
        role: 'user',
      });
      let error: unknown;
      http.patch('/api/users/me', { fullName: 'Changed A' }).subscribe({
        error: (value) => (error = value),
      });
      authService.user.and.returnValue({
        id: 'b',
        fullName: 'B',
        email: 'b@example.com',
        role: 'user',
      });
      session.setToken('account-b-token');
      httpMock.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
      flushMicrotasks();
      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(error).toEqual(jasmine.any(SessionIdentityError));
      httpMock.expectNone('/api/users/me');
    }));

    it('does not retry an incorrect current password as an expired session', () => {
      session.setToken('access');
      let status: number | undefined;
      http
        .post('/api/auth/change-password', {
          currentPassword: 'wrong',
          newPassword: 'new-password',
        })
        .subscribe({
          error: (error) => {
            status = error.status;
          },
        });
      httpMock
        .expectOne('/api/auth/change-password')
        .flush(
          { message: 'Invalid current password' },
          { status: 401, statusText: 'Unauthorized' },
        );
      expect(status).toBe(401);
      expect(authService.refreshSession).not.toHaveBeenCalled();
    });
    it('blocks a queued request when the current account differs from its owner', () => {
      authService.assertIdentity.and.throwError(new SessionIdentityError());
      let error: unknown;
      http
        .post(
          '/api/uploads/init',
          {},
          { context: new HttpContext().set(EXPECTED_USER_ID, 'owner-a') },
        )
        .subscribe({ error: (value) => (error = value) });
      httpMock.expectNone('/api/uploads/init');
      expect(error).toEqual(jasmine.any(SessionIdentityError));
    });

    it('rechecks the owner after a refresh before retrying a queued request', fakeAsync(() => {
      session.setToken('expired');
      authService.user.and.returnValue({
        id: 'owner-a',
        fullName: 'A',
        email: 'a@example.com',
        role: 'user',
      });
      authService.refreshSession.and.callFake(async () => {
        authService.assertIdentity.and.throwError(new SessionIdentityError());
        return 'other-account-token';
      });
      let error: unknown;
      http
        .post(
          '/api/uploads/init',
          {},
          { context: new HttpContext().set(EXPECTED_USER_ID, 'owner-a') },
        )
        .subscribe({ error: (value) => (error = value) });
      httpMock
        .expectOne('/api/uploads/init')
        .flush({}, { status: 401, statusText: 'Unauthorized' });
      flushMicrotasks();
      expect(authService.refreshSession).toHaveBeenCalledWith('owner-a');
      httpMock.expectNone('/api/uploads/init');
      expect(error).toEqual(jasmine.any(SessionIdentityError));
    }));

    it('does not recurse when /me rejects a newly refreshed token', () => {
      session.setToken('token');
      http.get('/api/auth/me').subscribe({ error: () => undefined });
      httpMock.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(authService.refreshSession).not.toHaveBeenCalled();
    });

    it('retries the original request after a successful refresh', fakeAsync(() => {
      session.setToken('expired-token');
      authService.refreshSession.and.resolveTo('fresh-token');

      let response: unknown;
      http.get('/api/uploads').subscribe({
        next: (body) => {
          response = body;
        },
      });

      // First request gets 401
      const req1 = httpMock.expectOne('/api/uploads');
      expect(req1.request.headers.get('Authorization')).toBe('Bearer expired-token');
      req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      // Flush microtasks so the refresh promise resolves
      flushMicrotasks();

      // Refresh was called
      expect(authService.refreshSession).toHaveBeenCalledTimes(1);

      // Retry with fresh token
      const req2 = httpMock.expectOne('/api/uploads');
      expect(req2.request.headers.get('Authorization')).toBe('Bearer fresh-token');
      req2.flush({ data: 'ok' });

      expect(response).toEqual({ data: 'ok' });
    }));

    it('fails the original request when refresh returns null', fakeAsync(() => {
      session.setToken('expired-token');
      authService.refreshSession.and.resolveTo(null);
      let error: unknown;

      http.get('/api/uploads').subscribe({
        error: (err) => {
          error = err;
        },
      });

      const req = httpMock.expectOne('/api/uploads');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      flushMicrotasks();

      expect(authService.refreshSession).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(error).toBeDefined();
      expect((error as { status: number }).status).toBe(401);
    }));

    it('navigates with the disabled reason when the session was suspended', fakeAsync(() => {
      session.setToken('expired-token');
      authService.refreshSession.and.resolveTo(null);
      authService.accountDisabled.and.returnValue(true);

      http.get('/api/uploads').subscribe({ error: () => undefined });

      httpMock
        .expectOne('/api/uploads')
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      flushMicrotasks();

      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'disabled' },
      });
    }));

    it('surfaces refresh failures instead of masking them as the original 401', fakeAsync(() => {
      session.setToken('expired-token');
      const refreshError = new Error('Network error');
      authService.refreshSession.and.rejectWith(refreshError);
      let error: unknown;

      http.get('/api/uploads').subscribe({
        error: (err) => {
          error = err;
        },
      });

      const req = httpMock.expectOne('/api/uploads');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      flushMicrotasks();

      expect(authService.refreshSession).toHaveBeenCalledTimes(1);
      expect(error).toBe(refreshError);
    }));

    it('does not retry 401 on /auth/refresh to prevent loops', () => {
      session.setToken('some-token');
      const errors: unknown[] = [];

      http.post('/api/auth/refresh', {}).subscribe({
        error: (err) => errors.push(err),
      });

      const req = httpMock.expectOne('/api/auth/refresh');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
    });

    it('does not retry 401 on /auth/login to prevent loops', () => {
      session.setToken('some-token');
      const errors: unknown[] = [];

      http.post('/api/auth/login', {}).subscribe({
        error: (err) => errors.push(err),
      });

      const req = httpMock.expectOne('/api/auth/login');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
    });

    it('does not retry 401 on /auth/register to prevent loops', () => {
      session.setToken('some-token');
      const errors: unknown[] = [];

      http.post('/api/auth/register', {}).subscribe({
        error: (err) => errors.push(err),
      });

      const req = httpMock.expectOne('/api/auth/register');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
    });

    it('passes through non-401 errors without refresh', () => {
      session.setToken('valid-token');
      const errors: unknown[] = [];

      http.get('/api/uploads').subscribe({
        error: (err) => errors.push(err),
      });

      const req = httpMock.expectOne('/api/uploads');
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
      expect((errors[0] as { status: number }).status).toBe(403);
    });

    it('does not retry 401 on a request that had no initial token', () => {
      const errors: unknown[] = [];

      http.get('/api/uploads').subscribe({
        error: (err) => errors.push(err),
      });

      const req = httpMock.expectOne('/api/uploads');
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(authService.refreshSession).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
    });
  });
});
