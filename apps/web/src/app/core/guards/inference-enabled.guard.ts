import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { RuntimeConfigService } from '../services/runtime-config.service';

export const inferenceEnabledGuard: CanMatchFn = () => {
  const runtimeConfig = inject(RuntimeConfigService);
  const router = inject(Router);
  return runtimeConfig.config().inferenceEnabled ? true : router.createUrlTree(['/dashboard']);
};
