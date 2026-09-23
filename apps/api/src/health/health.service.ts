import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION, type DatabaseConnection } from '../database/database.constants';
import { sql } from 'drizzle-orm';
import { StorageService, type StorageHealthResult } from '../storage/storage.service';
import { WorkerObservabilityRepository } from '../database/repositories/worker-observability.repository';
import { WorkerRuntime } from '../worker/worker-runtime';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

export interface DbHealthStatus {
  status: 'ok' | 'error';
  message: string;
  latencyMs: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly workerObservability: WorkerObservabilityRepository,
    private readonly workerRuntime: WorkerRuntime,
  ) {}

  getBasicHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<{ status: 'ok' | 'error' }> {
    try {
      const [db, storage] = await Promise.all([this.getDbHealth(), this.getStorageHealth()]);
      const workerReady =
        !this.configService.get<boolean>('WORKER_ENABLED', false) || this.workerRuntime.isRunning();
      return {
        status: db.status === 'ok' && storage.status === 'ok' && workerReady ? 'ok' : 'error',
      };
    } catch {
      this.logger.error('Readiness check failed');
      return { status: 'error' };
    }
  }

  getRuntimeConfig() {
    return {
      inferenceEnabled: this.configService.get<boolean>('INFERENCE_ENABLED', false),
      mailEnabled: this.configService.get<boolean>('MAIL_ENABLED', false),
    };
  }

  async getDbHealth(): Promise<DbHealthStatus> {
    const start = performance.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      const latencyMs = Math.round(performance.now() - start);
      return { status: 'ok', message: 'Database connection OK', latencyMs };
    } catch (error: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      // Never expose the raw database error text on a (now admin-only) endpoint.
      // Log it server-side and return a fixed public-facing message.
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Database health check failed: ${message}`);
      return { status: 'error', message: 'Database check failed', latencyMs };
    }
  }

  async getStorageHealth(): Promise<StorageHealthResult> {
    return this.storageService.checkHealth();
  }

  async getWorkerHealth() {
    return this.workerObservability.getHealth(
      this.configService.get<number>('WORKER_QUEUE_AGE_THRESHOLD_MS', 900000),
      this.configService.get<number>('WORKER_DEAD_JOB_THRESHOLD', 1),
    );
  }
}
