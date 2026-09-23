import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['initialize', 'refreshClaims']);
    authSpy.initialize.and.resolveTo(null);

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authSpy }],
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('allows activation when user is admin', async () => {
    authService.refreshClaims.and.resolveTo(true);
    const result = await TestBed.runInInjectionContext(() => adminGuard(dummyRoute, dummyState));
    expect(result).toBeTrue();
    expect(authService.refreshClaims).toHaveBeenCalledTimes(1);
  });

  it('redirects to /dashboard when user is not admin', async () => {
    authService.refreshClaims.and.resolveTo(false);
    const result = await TestBed.runInInjectionContext(() => adminGuard(dummyRoute, dummyState));
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary']?.segments.map((s) => s.path).join('/')).toBe('dashboard');
    expect(authService.refreshClaims).toHaveBeenCalledTimes(1);
  });

  it('redirects to /dashboard when user is not admin (unauthenticated)', async () => {
    authService.refreshClaims.and.resolveTo(false);
    const result = await TestBed.runInInjectionContext(() => adminGuard(dummyRoute, dummyState));
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.root.children['primary']?.segments.map((s) => s.path).join('/')).toBe('dashboard');
  });
});
