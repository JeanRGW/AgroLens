import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { UserPublic, UserRole } from '@agrolens/contracts';

describe('authGuard', () => {
  let authService: AuthService;
  let httpMock: HttpTestingController;
  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = { url: '/uploads' } as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.removeItem('agrolens:offline-user');
    spyOn(navigator.locks, 'request').and.callFake(((
      _name: string,
      callback: LockGrantedCallback<unknown>,
    ) => Promise.resolve(callback(null))) as typeof navigator.locks.request);
    TestBed.configureTestingModule({
      providers: [AuthService, SessionService, provideHttpClient(), provideHttpClientTesting()],
    });
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('agrolens:offline-user');
    httpMock.verify();
  });

  ['/uploads/new', '/uploads/new?localId=local-1'].forEach((url) => {
    it(`waits for the cold-start identity before allowing ${url}`, fakeAsync(() => {
      spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
      const user: UserPublic = {
        id: 'owner',
        fullName: 'Owner',
        role: 'user',
        email: 'owner@test.com',
      };
      // AppComponent starts initialization independently of the first navigation.
      void authService.initialize();
      let allowed: unknown;
      let activationUser: UserPublic | null = null;
      void Promise.resolve(
        TestBed.runInInjectionContext(() => authGuard(dummyRoute, { url } as RouterStateSnapshot)),
      ).then((result) => {
        allowed = result;
        activationUser = authService.user();
      });

      const refresh = httpMock.expectOne('/api/auth/refresh');
      flushMicrotasks();
      expect(allowed).toBeUndefined();
      expect(authService.user()).toBeNull();

      refresh.flush({ accessToken: 'restored-token' });
      flushMicrotasks();
      expect(allowed).toBeUndefined();
      expect(authService.user()).toBeNull();

      httpMock.expectOne('/api/auth/me').flush({ user });
      flushMicrotasks();
      expect(allowed).toBeTrue();
      expect<UserPublic | null>(activationUser).toEqual(jasmine.objectContaining(user));
    }));
  });

  it('allows activation when user is authenticated', async () => {
    const user: UserPublic = {
      id: 'u1',
      fullName: 'Test',
      role: 'user',
      email: 'test@test.com',
    };
    (
      authService as unknown as { userState: { set: (u: UserPublic | null) => void } }
    ).userState.set(user);
    // Steady state: app initialization already completed, so the guard must
    // not trigger another session refresh.
    (authService as unknown as { initialized: boolean }).initialized = true;

    const result = await TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));
    // Initialization already completed, so the guard reuses the session without refreshing.
    httpMock.expectNone('/api/auth/refresh');
    expect(result).toBeTrue();
  });

  it('routes an offline dashboard launch to the local queue', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    const user: UserPublic = {
      id: 'u1',
      fullName: 'Test',
      role: 'user',
      email: 'test@test.com',
    };
    (
      authService as unknown as { userState: { set: (u: UserPublic | null) => void } }
    ).userState.set(user);
    (authService as unknown as { initialized: boolean }).initialized = true;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard(dummyRoute, { url: '/dashboard' } as RouterStateSnapshot),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(
      (result as UrlTree).root.children['primary']?.segments
        .map((segment) => segment.path)
        .join('/'),
    ).toBe('uploads/queue');
  });

  it('routes an offline dashboard launch with query params to the local queue', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    const user: UserPublic = {
      id: 'u1',
      fullName: 'Test',
      role: 'user',
      email: 'test@test.com',
    };
    (
      authService as unknown as { userState: { set: (u: UserPublic | null) => void } }
    ).userState.set(user);
    (authService as unknown as { initialized: boolean }).initialized = true;

    const result = await TestBed.runInInjectionContext(() =>
      authGuard(dummyRoute, { url: '/dashboard/?from=home' } as RouterStateSnapshot),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(
      (result as UrlTree).root.children['primary']?.segments
        .map((segment) => segment.path)
        .join('/'),
    ).toBe('uploads/queue');
  });

  it('redirects to /login with redirect param when not authenticated', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));

    // Flush the /auth/refresh call triggered by initialize()
    httpMock.expectOne('/api/auth/refresh').error(new ProgressEvent('error'));

    const result = await resultPromise;
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary']?.segments.map((s) => s.path).join('/')).toBe('login');
    expect(tree.queryParams['redirect']).toBe('/uploads');
  });

  it('redirects to /login via UrlTree when not authenticated', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));

    // Flush the /auth/refresh call triggered by initialize()
    httpMock.expectOne('/api/auth/refresh').error(new ProgressEvent('error'));

    const result = await resultPromise;
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('login');
  });
});
