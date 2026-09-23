import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HealthController } from '../../src/health/health.controller';
import { HealthService } from '../../src/health/health.service';
import { CRITICAL_THROTTLE_KEY } from '../../src/rate-limit/rate-limit.guard';

describe('HealthController readiness', () => {
  const getReadiness = jest.fn();
  const controller = new HealthController({ getReadiness } as unknown as HealthService);

  it('uses the critical throttle tier instead of skipping request limits', () => {
    const reflector = new Reflector();
    expect(reflector.get(CRITICAL_THROTTLE_KEY, controller.getReadiness)).toBe(true);
    expect(reflector.get('THROTTLER:SKIPdefault', controller.getReadiness)).toBeUndefined();
  });

  it('returns 200 only when dependencies are ready', async () => {
    getReadiness.mockResolvedValueOnce({ status: 'ok' });
    await expect(controller.getReadiness()).resolves.toEqual({ status: 'ok' });
  });

  it('returns 503 without exposing dependency details', async () => {
    getReadiness.mockResolvedValueOnce({ status: 'error' });
    await expect(controller.getReadiness()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { status: 'error' },
    });
  });
});
