import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { UsersRepository } from './repositories/users.repository';
import { CatalogRepository } from './repositories/catalog.repository';
import { UploadsRepository } from './repositories/uploads.repository';
import { AccessRepository } from './repositories/access.repository';
import { AuditRepository } from './repositories/audit.repository';
import { JobsRepository } from './repositories/jobs.repository';
import { InferenceRepository } from './repositories/inference.repository';
import { InferenceModelsRepository } from './repositories/inference-models.repository';
import { WorkerObservabilityRepository } from './repositories/worker-observability.repository';
import { RetentionRepository } from './repositories/retention.repository';
import { AnnotationsRepository } from './repositories/annotations.repository';
import { PasswordResetTokensRepository } from './repositories/password-reset-tokens.repository';
import { DATABASE_CONNECTION } from './database.constants';

const repositories = [
  UsersRepository,
  CatalogRepository,
  UploadsRepository,
  AccessRepository,
  AuditRepository,
  JobsRepository,
  InferenceRepository,
  InferenceModelsRepository,
  WorkerObservabilityRepository,
  RetentionRepository,
  AnnotationsRepository,
  PasswordResetTokensRepository,
];

/**
 * Holds a reference to the raw postgres client so it can be closed
 * after workers drain and the HTTP server closes (including `app.close()` in tests).
 */
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  private client: ReturnType<typeof postgres> | null = null;

  setClient(client: ReturnType<typeof postgres>) {
    this.client = client;
  }

  async onApplicationShutdown() {
    if (this.client) {
      await this.client.end({ timeout: 5 });
    }
  }
}

@Global()
@Module({
  providers: [
    DatabaseLifecycle,
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService, DatabaseLifecycle],
      useFactory: (
        configService: ConfigService,
        lifecycle: DatabaseLifecycle,
      ): PostgresJsDatabase<typeof schema> => {
        const url = configService.getOrThrow<string>('DATABASE_URL');
        const client = postgres(url, {
          max: 10,
          connect_timeout: 10,
          connection: { statement_timeout: 30_000, idle_in_transaction_session_timeout: 120_000 },
          onnotice: () => {},
        });
        lifecycle.setClient(client);
        return drizzle(client, { schema });
      },
    },
    ...repositories,
  ],
  exports: [DATABASE_CONNECTION, ...repositories],
})
export class DatabaseModule {}
