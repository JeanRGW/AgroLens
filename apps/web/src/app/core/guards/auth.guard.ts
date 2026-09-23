import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Always wait for cold-start initialization. AppComponent restores the cached
  // user synchronously while the session refresh is still in flight; child
  // guards (e.g. admin) issue authenticated requests and must not run with a
  // still-empty token. initialize() is idempotent and shares one promise.
  let user: Awaited<ReturnType<AuthService['initialize']>>;
  try {
    user = await authService.initialize();
  } catch {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  if (user) {
    const path = (state.url.split('?')[0] || '/').replace(/\/+$/, '') || '/';
    if (
      (authService.offlineSession() || !navigator.onLine) &&
      (path === '/' || path === '/dashboard')
    ) {
      return router.createUrlTree(['/uploads/queue']);
    }
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { redirect: state.url },
  });
};
