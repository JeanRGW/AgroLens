import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Child guards must wait for the cold-start session refresh.
  let user: Awaited<ReturnType<AuthService['initialize']>>;
  try {
    user = await authService.initialize();
  } catch {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  if (user) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { redirect: state.url },
  });
};
