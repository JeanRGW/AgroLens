import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceEnabledGuard } from '../../src/inference/inference-enabled.guard';

describe('InferenceEnabledGuard', () => {
  const mockContext = {} as ExecutionContext;

  it('allows access when INFERENCE_ENABLED is true', () => {
    const config = {
      get: jest.fn((key: string) => (key === 'INFERENCE_ENABLED' ? true : undefined)),
    } as unknown as ConfigService;
    const guard = new InferenceEnabledGuard(config);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('throws ServiceUnavailableException when INFERENCE_ENABLED is false', () => {
    const config = {
      get: jest.fn((key: string) => (key === 'INFERENCE_ENABLED' ? false : undefined)),
    } as unknown as ConfigService;
    const guard = new InferenceEnabledGuard(config);

    expect(() => guard.canActivate(mockContext)).toThrow(ServiceUnavailableException);
  });

  it('defaults to disabled (throws ServiceUnavailableException) when config is absent or returns default', () => {
    const guardNoConfig = new InferenceEnabledGuard(undefined);
    expect(() => guardNoConfig.canActivate(mockContext)).toThrow(ServiceUnavailableException);

    const configDefault = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as ConfigService;
    const guardDefault = new InferenceEnabledGuard(configDefault);
    expect(() => guardDefault.canActivate(mockContext)).toThrow(ServiceUnavailableException);
  });
});
