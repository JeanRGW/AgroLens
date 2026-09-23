import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../../src/health/health.service';
import { DATABASE_CONNECTION } from '../../src/database/database.constants';
import { StorageService } from '../../src/storage/storage.service';
import { WorkerObservabilityRepository } from '../../src/database/repositories/worker-observability.repository';
import { WorkerRuntime } from '../../src/worker/worker-runtime';

describe('HealthService', () => {
  let service: HealthService;

  const mockDb = {
    execute: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  const mockStorageService = {
    checkHealth: jest.fn().mockResolvedValue({
      status: 'ok',
      message: 'Bucket "test" is accessible',
      endpoint: 'http://localhost:9000',
      bucket: 'test',
    }),
  };

  const mockWorkerRuntime = { isRunning: jest.fn().mockReturnValue(true) };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown): unknown => {
      if (key === 'NODE_ENV') return 'test';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: WorkerObservabilityRepository, useValue: {} },
        { provide: WorkerRuntime, useValue: mockWorkerRuntime },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    mockDb.execute.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    mockStorageService.checkHealth.mockReset().mockResolvedValue({ status: 'ok' });
    mockWorkerRuntime.isRunning.mockReset().mockReturnValue(true);
    mockConfigService.get.mockImplementation(
      (_key: string, defaultValue?: unknown) => defaultValue,
    );
  });

  it('should return minimal public liveness', () => {
    const result = service.getBasicHealth();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    // Public liveness must not leak environment or version details.
    expect(result).not.toHaveProperty('environment');
    expect(result).not.toHaveProperty('version');
  });

  it('should expose only safe runtime configuration', () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown): unknown => {
      if (key === 'INFERENCE_ENABLED') return false;
      if (key === 'MAIL_ENABLED') return false;
      return defaultValue;
    });

    expect(service.getRuntimeConfig()).toEqual({ inferenceEnabled: false, mailEnabled: false });
  });

  it('should return db health when database is reachable', async () => {
    const result = await service.getDbHealth();
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Database connection OK');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('should return db health error with a fixed message when database is unreachable', async () => {
    mockDb.execute.mockRejectedValueOnce(new Error('Connection refused to 10.0.0.1'));
    const result = await service.getDbHealth();
    expect(result.status).toBe('error');
    expect(result.message).toBe('Database check failed');
    // Raw error text must never leak on the endpoint.
    expect(result.message).not.toContain('Connection refused');
  });

  it('should return storage health', async () => {
    const result = await service.getStorageHealth();
    expect(result.status).toBe('ok');
  });

  it('returns generic readiness only when database, storage and enabled worker are ready', async () => {
    mockConfigService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'WORKER_ENABLED' ? true : fallback,
    );
    expect(await service.getReadiness()).toEqual({ status: 'ok' });

    mockWorkerRuntime.isRunning.mockReturnValue(false);
    expect(await service.getReadiness()).toEqual({ status: 'error' });

    mockWorkerRuntime.isRunning.mockReturnValue(true);
    mockStorageService.checkHealth.mockResolvedValueOnce({ status: 'error' });
    expect(await service.getReadiness()).toEqual({ status: 'error' });

    mockDb.execute.mockRejectedValueOnce(new Error('private database address'));
    expect(await service.getReadiness()).toEqual({ status: 'error' });
  });

  it('keeps readiness generic when a dependency throws or the worker is intentionally disabled', async () => {
    mockStorageService.checkHealth.mockRejectedValueOnce(new Error('private storage address'));
    expect(await service.getReadiness()).toEqual({ status: 'error' });

    mockWorkerRuntime.isRunning.mockReturnValue(false);
    expect(await service.getReadiness()).toEqual({ status: 'ok' });
    expect(mockWorkerRuntime.isRunning).not.toHaveBeenCalled();
  });

  it('should evaluate worker queue health', async () => {
    const workerObservability = { getHealth: jest.fn().mockResolvedValue({ status: 'ok' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: WorkerObservabilityRepository, useValue: workerObservability },
        { provide: WorkerRuntime, useValue: mockWorkerRuntime },
      ],
    }).compile();
    const scoped = module.get<HealthService>(HealthService);

    await scoped.getWorkerHealth();

    expect(workerObservability.getHealth).toHaveBeenCalledTimes(1);
    const [ageThresholdMs, deadThreshold] = workerObservability.getHealth.mock
      .calls[0] as unknown[];
    expect(ageThresholdMs).toBe(900000);
    expect(deadThreshold).toBe(1);
  });
});
