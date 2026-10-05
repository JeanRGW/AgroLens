import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/uploads/new' } as RouterStateSnapshot;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthService', ['initialize']);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('waits for cold-start authentication before allowing activation', async () => {
    let resolve!: (user: Awaited<ReturnType<AuthService['initialize']>>) => void;
    auth.initialize.and.returnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const result = TestBed.runInInjectionContext(() => authGuard(route, state));
    resolve({ id: 'u', email: 'u@test', fullName: 'User', role: 'user' });
    expect(await result).toBeTrue();
  });

  it('redirects unauthenticated users to login with the original destination', async () => {
    auth.initialize.and.resolveTo(null);
    const result = (await TestBed.runInInjectionContext(() => authGuard(route, state))) as UrlTree;
    expect(result.toString()).toContain('login');
    expect(result.queryParams['redirect']).toBe('/uploads/new');
  });

  it('redirects authentication failures instead of allowing offline access', async () => {
    auth.initialize.and.rejectWith(new Error('Network unavailable'));
    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBeInstanceOf(UrlTree);
  });
});
