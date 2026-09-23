import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  let isAdmin = false;
  try {
    // Wait for the cold-start session refresh so /auth/me carries a token.
    await authService.initialize();
    isAdmin = await authService.refreshClaims();
  } catch {
    return router.createUrlTree(['/dashboard']);
  }
  if (isAdmin) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
