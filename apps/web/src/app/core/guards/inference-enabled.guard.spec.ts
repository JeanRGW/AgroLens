import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { inferenceEnabledGuard } from './inference-enabled.guard';
import { RuntimeConfigService } from '../services/runtime-config.service';

describe('inferenceEnabledGuard', () => {
  it('allows inference when enabled', () => {
    const runtimeConfig = { config: () => ({ inferenceEnabled: true }) };
    TestBed.configureTestingModule({
      providers: [{ provide: RuntimeConfigService, useValue: runtimeConfig }],
    });

    const result = TestBed.runInInjectionContext(() =>
      inferenceEnabledGuard({} as never, [] as never),
    );

    expect(result).toBe(true);
  });

  it('redirects when inference is disabled', () => {
    const router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    const redirect = { redirect: '/dashboard' } as never;
    router.createUrlTree.and.returnValue(redirect);
    const runtimeConfig = { config: () => ({ inferenceEnabled: false }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: RuntimeConfigService, useValue: runtimeConfig },
        { provide: Router, useValue: router },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      inferenceEnabledGuard({} as never, [] as never),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe(redirect);
  });
});
