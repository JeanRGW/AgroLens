import { Global, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import postgres from 'postgres';
import { DatabaseModule } from '../../src/database/database.module';
import { StorageModule } from '../../src/storage/storage.module';
import { WorkerRuntime } from '../../src/worker/worker-runtime';
import { FinalizationService } from '../../src/worker/finalization.service';
import { DeletionService } from '../../src/worker/deletion.service';
import { InferenceService } from '../../src/worker/inference.service';
import { AbandonedUploadCleanupService } from '../../src/worker/abandoned-upload-cleanup.service';

jest.mock('postgres', () => jest.fn());
jest.mock('drizzle-orm/postgres-js', () => ({ drizzle: jest.fn(() => ({})) }));
jest.mock('@aws-sdk/client-s3', () => ({
  ...jest.requireActual('@aws-sdk/client-s3'),
  S3Client: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('WorkerRuntime lifecycle', () => {
  let app: INestApplication | undefined;
  let events: string[];
  const databaseEnd = jest.fn();
  const storageDestroy = jest.fn();
  const finalization = { processNextJob: jest.fn() };
  const deletion = { processNextJob: jest.fn() };
  const inference = {
    processNextModelValidation: jest.fn(),
    processNextInferenceImage: jest.fn(),
    processExpiredJobs: jest.fn(),
  };
  const cleanup = { cleanup: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    events = [];
    databaseEnd.mockImplementation(async () => {
      events.push('database-closed');
    });
    storageDestroy.mockImplementation(() => {
      events.push('storage-closed');
    });
    (postgres as unknown as jest.Mock).mockReturnValue({ end: databaseEnd });
    (S3Client as jest.Mock).mockImplementation(() => ({ destroy: storageDestroy }));
    finalization.processNextJob.mockResolvedValue(false);
    deletion.processNextJob.mockResolvedValue(false);
    inference.processNextModelValidation.mockResolvedValue(false);
    inference.processNextInferenceImage.mockResolvedValue(false);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function start(overrides: Record<string, unknown> = {}) {
    @Global()
    @Module({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            WORKER_ENABLED: true,
            INFERENCE_ENABLED: true,
            WORKER_POLL_INTERVAL_MS: 60_000,
            WORKER_CLEANUP_INTERVAL_MS: 60_000,
            DATABASE_URL: 'postgresql://unused/test',
            S3_ENDPOINT: 'http://localhost:3900',
            S3_REGION: 'garage',
            S3_BUCKET: 'test',
            S3_ACCESS_KEY: 'test',
            S3_SECRET_KEY: 'test',
            CORS_ORIGINS: [],
            ...overrides,
          }),
        },
      ],
      exports: [ConfigService],
    })
    class TestConfigModule {}

    const module = await Test.createTestingModule({
      imports: [TestConfigModule, DatabaseModule, StorageModule],
      providers: [
        WorkerRuntime,
        { provide: FinalizationService, useValue: finalization },
        { provide: DeletionService, useValue: deletion },
        { provide: InferenceService, useValue: inference },
        { provide: AbandonedUploadCleanupService, useValue: cleanup },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    return app;
  }

  it('reports runtime readiness only while its loops are running', async () => {
    const application = await start();
    const runtime = application.get(WorkerRuntime);
    expect(runtime.isRunning()).toBe(true);

    await application.close();
    app = undefined;
    expect(runtime.isRunning()).toBe(false);
  });

  it('drains an in-flight job before closing PostgreSQL or S3', async () => {
    const finish = deferred<boolean>();
    finalization.processNextJob.mockImplementationOnce(async () => {
      const result = await finish.promise;
      expect(databaseEnd).not.toHaveBeenCalled();
      expect(storageDestroy).not.toHaveBeenCalled();
      events.push('job-drained');
      return result;
    });
    const application = await start();
    const runtime = application.get(WorkerRuntime);
    const stopping = deferred<void>();
    const stop = runtime.beforeApplicationShutdown.bind(runtime);
    jest.spyOn(runtime, 'beforeApplicationShutdown').mockImplementation(() => {
      const result = stop();
      stopping.resolve();
      return result;
    });
    const closing = application.close();
    try {
      await stopping.promise;
      expect(databaseEnd).not.toHaveBeenCalled();
      expect(storageDestroy).not.toHaveBeenCalled();
    } finally {
      finish.resolve(true);
      await closing;
      app = undefined;
    }
    expect(finalization.processNextJob).toHaveBeenCalledTimes(1);
    expect(events[0]).toBe('job-drained');
    expect(databaseEnd).toHaveBeenCalledTimes(1);
    expect(storageDestroy).toHaveBeenCalledTimes(2);
  });

  it('interrupts long idle waits, including cleanup, at maximum concurrency', async () => {
    const application = await start({
      WORKER_FINALIZATION_CONCURRENCY: 10,
      WORKER_DELETION_CONCURRENCY: 10,
      WORKER_INFERENCE_CONCURRENCY: 10,
    });
    const started = performance.now();
    await application.close();
    app = undefined;
    expect(performance.now() - started).toBeLessThan(2000);
    expect(cleanup.cleanup).not.toHaveBeenCalled();
    expect(finalization.processNextJob).toHaveBeenCalledTimes(10);
    expect(deletion.processNextJob).toHaveBeenCalledTimes(10);
  });

  it('cancels inference after the drain deadline before closing shared clients', async () => {
    let requestSignal!: AbortSignal;
    inference.processNextModelValidation.mockImplementationOnce((signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<boolean>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            expect(databaseEnd).not.toHaveBeenCalled();
            expect(storageDestroy).not.toHaveBeenCalled();
            resolve(true);
          },
          { once: true },
        );
      });
    });
    const application = await start();
    jest.useFakeTimers();
    try {
      const stopping = application.get(WorkerRuntime).beforeApplicationShutdown();
      expect(requestSignal.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      await stopping;
      expect(requestSignal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
    await application.close();
    app = undefined;
    expect(databaseEnd).toHaveBeenCalledTimes(1);
    expect(storageDestroy).toHaveBeenCalledTimes(2);
  });

  it('propagates non-abort pause failures while swallowing shutdown aborts', async () => {
    const eventsModule = jest.requireActual('node:events') as {
      setMaxListeners: typeof import('node:events').setMaxListeners;
    };
    const maxListenersSpy = jest.spyOn(eventsModule, 'setMaxListeners');
    await start({
      WORKER_FINALIZATION_CONCURRENCY: 3,
      WORKER_DELETION_CONCURRENCY: 2,
      WORKER_INFERENCE_CONCURRENCY: 4,
    });
    expect(maxListenersSpy).toHaveBeenCalledWith(
      3 + 2 + 4 + 1 + 1,
      expect.objectContaining({ aborted: expect.any(Boolean) }),
    );
    maxListenersSpy.mockRestore();

    const runtime = app!.get(WorkerRuntime);
    const controller = (runtime as unknown as { shutdownController: AbortController })
      .shutdownController;
    const pause = (runtime as unknown as { pause: (ms: number) => Promise<void> }).pause.bind(
      runtime,
    );
    controller.abort();
    await expect(pause(60_000)).resolves.toBeUndefined();

    const fresh = new AbortController();
    Object.defineProperty(runtime, 'shutdownController', { value: fresh, configurable: true });
    const nonAbort = Promise.resolve().then(() => {
      throw new Error('timer failure');
    });
    const timersModule = jest.requireActual('node:timers/promises') as Record<string, unknown>;
    const originalSetTimeout = timersModule.setTimeout;
    timersModule.setTimeout = () => nonAbort;
    try {
      await expect(pause(1000)).rejects.toThrow('timer failure');
    } finally {
      timersModule.setTimeout = originalSetTimeout;
    }
  });

  it('does not start image processing when shutdown begins during a model poll', async () => {
    const finish = deferred<boolean>();
    inference.processNextModelValidation.mockReturnValueOnce(finish.promise);
    const application = await start();
    const runtime = application.get(WorkerRuntime);
    const stopping = runtime.beforeApplicationShutdown();
    finish.resolve(false);
    await stopping;
    await runtime.beforeApplicationShutdown();
    expect(inference.processNextInferenceImage).not.toHaveBeenCalled();
    expect(inference.processNextModelValidation).toHaveBeenCalledTimes(1);
  });

  it('closes cleanly when workers are disabled', async () => {
    const application = await start({ WORKER_ENABLED: false });
    await application.close();
    app = undefined;
    expect(finalization.processNextJob).not.toHaveBeenCalled();
    expect(inference.processNextModelValidation).not.toHaveBeenCalled();
    expect(databaseEnd).toHaveBeenCalledTimes(1);
    expect(storageDestroy).toHaveBeenCalledTimes(2);
  });

  it.each(['processNextModelValidation', 'processNextInferenceImage'] as const)(
    'backs off after %s fails, then resumes polling',
    async (operation) => {
      const retried = deferred<number>();
      let failedAt = 0;
      inference[operation]
        .mockImplementationOnce(async () => {
          failedAt = performance.now();
          throw new Error('database unavailable');
        })
        .mockImplementationOnce(async () => {
          retried.resolve(performance.now());
          return false;
        });
      await start({ WORKER_POLL_INTERVAL_MS: 100 });
      const retriedAt = await retried.promise;
      expect(retriedAt - failedAt).toBeGreaterThanOrEqual(90);
    },
  );
});
