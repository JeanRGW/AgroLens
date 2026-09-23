import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { sanitizeError } from '../common/sanitize-error';
import { AbandonedUploadCleanupService } from './abandoned-upload-cleanup.service';
import { DeletionService } from './deletion.service';
import { FinalizationService } from './finalization.service';
import { InferenceService } from './inference.service';

type WorkType = 'deletion' | 'finalization' | 'inference' | 'cleanup';
type ProcessResult = boolean | void;

@Injectable()
export class WorkerRuntime implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(WorkerRuntime.name);
  private loops: Promise<void>[] = [];
  private shutdownPromise: Promise<void> | undefined;
  private readonly shutdownController = new AbortController();
  private readonly drainController = new AbortController();
  private stopping = false;
  private started = false;
  private failed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly finalization: FinalizationService,
    private readonly deletion: DeletionService,
    private readonly inference: InferenceService,
    private readonly uploadCleanup: AbandonedUploadCleanupService,
  ) {
    // Listeners are sized in start() once concurrencies are known.
  }

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('WORKER_ENABLED', false)) {
      this.logger.log('Worker is disabled (WORKER_ENABLED=false).', 'Worker');
      return;
    }

    this.started = true;
    this.start();
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.stop();
  }

  isRunning(): boolean {
    return this.started && !this.stopping && !this.failed;
  }

  private start(): void {
    const workerId =
      this.config.get<string>('WORKER_ID') ?? `worker-${process.pid}-${randomUUID()}`;
    const pollIntervalMs = this.config.get<number>('WORKER_POLL_INTERVAL_MS', 5000);
    const cleanupIntervalMs = this.config.get<number>('WORKER_CLEANUP_INTERVAL_MS', 60000);

    const log = (event: string, fields: Record<string, unknown> = {}) =>
      this.logger.log(JSON.stringify({ event, workerId, ...fields }), 'Worker');

    const runJob = async (type: WorkType, processJob: () => Promise<ProcessResult>) => {
      const pollId = randomUUID();
      const started = performance.now();
      this.logger.debug(
        JSON.stringify({ event: 'work_poll_started', type, pollId, workerId }),
        'Worker',
      );
      try {
        const processed = await processJob();
        const fields = {
          type,
          pollId,
          processed: Boolean(processed),
          durationMs: Math.round(performance.now() - started),
        };
        if (processed) log('work_poll_completed', fields);
        else
          this.logger.debug(
            JSON.stringify({ event: 'work_poll_completed', workerId, ...fields }),
            'Worker',
          );
        return Boolean(processed);
      } catch (error: unknown) {
        log('work_poll_failed', {
          type,
          pollId,
          durationMs: Math.round(performance.now() - started),
          error: sanitizeError(error),
        });
        return false;
      }
    };

    const loop = async (
      type: WorkType,
      count: number,
      processJob: () => Promise<ProcessResult>,
    ) => {
      const slots = Array.from({ length: Math.max(1, Math.min(10, count)) }, async (_, slot) => {
        while (!this.stopping) {
          const processed = await runJob(type, processJob);
          if (!processed && !this.stopping) {
            this.logger.debug(
              JSON.stringify({ event: 'work_slot_idle', type, slot, workerId }),
              'Worker',
            );
            await this.pause(pollIntervalMs);
          }
        }
      });
      await Promise.all(slots);
    };

    const inferenceEnabled = this.config.get<boolean>('INFERENCE_ENABLED', false);

    const cleanupLoop = async () => {
      while (!this.stopping) {
        await this.pause(cleanupIntervalMs);
        if (this.stopping) break;
        const pollId = randomUUID();
        const started = performance.now();
        try {
          const summary = await this.uploadCleanup.cleanup();
          // Sweep expired inference jobs even when the inference loop is
          // disabled so temporary source objects and job rows still drain.
          if (!this.stopping) await this.inference.processExpiredJobs();
          log('cleanup_completed', {
            pollId,
            durationMs: Math.round(performance.now() - started),
            summary,
          });
        } catch (error: unknown) {
          log('cleanup_failed', {
            pollId,
            durationMs: Math.round(performance.now() - started),
            error: sanitizeError(error),
          });
        }
      }
    };

    const concurrency = (key: string, fallback: number) => this.config.get<number>(key, fallback);
    const slotCount = (key: string, fallback: number) =>
      Math.max(1, Math.min(10, concurrency(key, fallback)));
    log('worker_started', { pollIntervalMs });

    // Every idle work slot and the cleanup loop awaits pause() on the shared
    // shutdown signal: deletion + finalization + inference slots + cleanup.
    // setMaxListeners keeps that fan-out below Node's default warning limit.
    setMaxListeners(
      slotCount('WORKER_DELETION_CONCURRENCY', 1) +
        slotCount('WORKER_FINALIZATION_CONCURRENCY', 1) +
        (inferenceEnabled ? slotCount('WORKER_INFERENCE_CONCURRENCY', 1) : 0) +
        1 +
        1,
      this.shutdownController.signal,
    );

    this.loops = [
      loop('deletion', concurrency('WORKER_DELETION_CONCURRENCY', 1), () =>
        this.deletion.processNextJob(),
      ),
      loop('finalization', concurrency('WORKER_FINALIZATION_CONCURRENCY', 1), () =>
        this.finalization.processNextJob(this.shutdownController.signal),
      ),
      cleanupLoop(),
    ];
    if (inferenceEnabled) {
      this.loops.splice(
        2,
        0,
        loop('inference', concurrency('WORKER_INFERENCE_CONCURRENCY', 1), async () => {
          const processed = await this.inference.processNextModelValidation(
            this.drainController.signal,
          );
          if (processed || this.stopping) return processed;
          return this.inference.processNextInferenceImage(this.drainController.signal);
        }),
      );
    }

    void Promise.all(this.loops).then(
      () => {
        if (!this.stopping) this.failed = true;
      },
      (error: unknown) => {
        this.failed = true;
        this.logger.error(`Worker runtime stopped unexpectedly: ${sanitizeError(error)}`, 'Worker');
      },
    );
  }

  private async pause(ms: number): Promise<void> {
    try {
      await wait(ms, undefined, { ref: false, signal: this.shutdownController.signal });
    } catch (error: unknown) {
      if (this.shutdownController.signal.aborted) return;
      throw error;
    }
  }

  private stop(): Promise<void> {
    if (!this.started) return Promise.resolve();
    if (this.shutdownPromise) return this.shutdownPromise;

    this.shutdownPromise = (async () => {
      this.stopping = true;
      this.shutdownController.abort();
      this.logger.log('Worker shutdown started.', 'Worker');
      // Leave time for cancellation and database cleanup before Compose's 6m grace expires.
      const deadline = setTimeout(() => this.drainController.abort(), 5 * 60_000);
      deadline.unref();
      try {
        await Promise.allSettled(this.loops);
      } finally {
        clearTimeout(deadline);
      }
      this.logger.log('Worker shutdown completed.', 'Worker');
    })();
    return this.shutdownPromise;
  }
}
