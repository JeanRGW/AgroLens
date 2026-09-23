import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions, ThrottlerRequest, ThrottlerStorage } from '@nestjs/throttler';
import {
  AppThrottlerGuard,
  CRITICAL_THROTTLE_KEY,
  CriticalThrottle,
} from '../../src/rate-limit/rate-limit.guard';

class TestController {
  @CriticalThrottle()
  criticalHandler(): void {}

  plainHandler(): void {}
}

describe('CriticalThrottle', () => {
  it('marks handlers for the reflector', () => {
    const reflector = new Reflector();
    expect(reflector.get(CRITICAL_THROTTLE_KEY, TestController.prototype.criticalHandler)).toBe(
      true,
    );
    expect(
      reflector.get(CRITICAL_THROTTLE_KEY, TestController.prototype.plainHandler),
    ).toBeUndefined();
  });
});

describe('AppThrottlerGuard', () => {
  const options = [{ name: 'default', ttl: 60000, limit: 120 }] as ThrottlerModuleOptions;

  async function setup(isCritical: boolean, ip: unknown) {
    const storage = {
      increment: jest.fn(async () => ({
        totalHits: 1,
        timeToExpire: 59,
        isBlocked: false,
        timeToBlockExpire: 0,
      })),
    } as unknown as ThrottlerStorage & { increment: jest.Mock };
    const reflector = {
      getAllAndOverride: jest.fn(() => isCritical),
    } as unknown as Reflector;
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'THROTTLE_AUTH_LIMIT') return 10;
        if (key === 'THROTTLE_AUTH_TTL_MS') return 60000;
        throw new Error(`unexpected config key ${key}`);
      }),
    } as unknown as ConfigService;
    const guard = new AppThrottlerGuard(options, storage, reflector, config);
    await guard.onModuleInit();
    const req: Record<string, unknown> = { ip, headers: {} };
    const sentHeaders: Record<string, unknown> = {};
    const res = {
      header: jest.fn((key: string, value: unknown) => {
        sentHeaders[key] = value;
      }),
    };
    const context = {
      getHandler: () => TestController.prototype.criticalHandler,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const props: ThrottlerRequest = {
      context,
      limit: 120,
      ttl: 60000,
      throttler: { name: 'default', limit: 120, ttl: 60000 },
      blockDuration: 60000,
      getTracker: (innerReq) =>
        (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker(innerReq),
      generateKey: (ctx, tracker, name) =>
        (guard as unknown as { generateKey(...args: unknown[]): string }).generateKey(
          ctx,
          tracker,
          name,
        ) as unknown as string,
    };
    return { guard, storage, sentHeaders, props };
  }

  it('uses the default tier for unmarked routes', async () => {
    const { guard, storage, sentHeaders, props } = await setup(false, '1.2.3.4');
    await expect(
      (
        guard as unknown as { handleRequest(props: ThrottlerRequest): Promise<boolean> }
      ).handleRequest(props),
    ).resolves.toBe(true);
    expect(storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      60000,
      120,
      60000,
      'default',
    );
    expect(sentHeaders['X-RateLimit-Limit']).toBe(120);
  });

  it('swaps marked routes to the env-driven critical tier with its own bucket', async () => {
    const plain = await setup(false, '1.2.3.4');
    const critical = await setup(true, '1.2.3.4');
    const asGuard = (guard: AppThrottlerGuard) =>
      guard as unknown as { handleRequest(props: ThrottlerRequest): Promise<boolean> };
    await asGuard(plain.guard).handleRequest(plain.props);
    await asGuard(critical.guard).handleRequest(critical.props);
    expect(critical.storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      60000,
      10,
      60000,
      'critical',
    );
    expect(critical.sentHeaders['X-RateLimit-Limit-critical']).toBe(10);
    const plainKey = plain.storage.increment.mock.calls[0][0];
    const criticalKey = critical.storage.increment.mock.calls[0][0];
    expect(criticalKey).not.toBe(plainKey);
  });

  it.each([
    ['client ip', '1.2.3.4', '1.2.3.4'],
    ['missing ip', undefined, 'unknown'],
    ['empty ip', '', 'unknown'],
  ])('tracks %s as %s', async (_label, ip, expected) => {
    const { guard } = await setup(false, ip);
    await expect(
      (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker({ ip }),
    ).resolves.toBe(expected);
  });
});
