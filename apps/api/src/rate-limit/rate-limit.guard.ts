import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * Marker for the stricter auth tier. Decorated handlers are throttled with
 * THROTTLE_AUTH_LIMIT/THROTTLE_AUTH_TTL_MS instead of the default tier.
 *
 * A marker (instead of `@Throttle` with inline numbers) keeps both quotas
 * env-driven: the guard resolves the critical limits from ConfigService at
 * request time, so operators can tune them without a code change.
 */
export const CRITICAL_THROTTLE_KEY = 'agrolens:critical-throttle';
export const CriticalThrottle = () => SetMetadata(CRITICAL_THROTTLE_KEY, true);

/**
 * Global throttler. Stock IP keying (`req.ip`, correct behind TRUST_PROXY);
 * requests without an IP share a single "unknown" bucket as a backstop.
 *
 * Only the `default` tier is configured on the module because every
 * configured tier applies to every route. Critical routes swap to the
 * `critical` storage bucket (separate counters/headers) in handleRequest.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storage, reflector);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const isCritical = this.reflector.getAllAndOverride<boolean>(CRITICAL_THROTTLE_KEY, [
      requestProps.context.getHandler(),
      requestProps.context.getClass(),
    ]);
    if (!isCritical) {
      return super.handleRequest(requestProps);
    }
    const ttl = this.config.getOrThrow<number>('THROTTLE_AUTH_TTL_MS');
    return super.handleRequest({
      ...requestProps,
      limit: this.config.getOrThrow<number>('THROTTLE_AUTH_LIMIT'),
      ttl,
      blockDuration: ttl,
      throttler: { ...requestProps.throttler, name: 'critical' },
    });
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = req.ip;
    return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
  }
}
