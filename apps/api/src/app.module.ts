import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfigModule } from './config/config.module';
import { MailModule } from './mail/mail.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { UploadsModule } from './uploads/uploads.module';
import { ImageProcessingModule } from './image-processing/image-processing.module';
import { WorkerModule } from './worker/worker.module';
import { AdminJobsModule } from './admin-jobs/admin-jobs.module';
import { UsersModule } from './users/users.module';
import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { InferenceModule } from './inference/inference.module';
import { AppThrottlerGuard } from './rate-limit/rate-limit.guard';

// Web client static distribution path:
// Resolves from WEB_DIST_PATH environment variable if provided,
// then falls back to production Docker bundle at join(__dirname, '..', 'web')
// or monorepo workspace build output at ../../../web/dist/agrolens-web/browser.
const webDistPath =
  process.env.WEB_DIST_PATH ||
  (existsSync(join(__dirname, '..', 'web'))
    ? join(__dirname, '..', 'web')
    : join(__dirname, '..', '..', '..', 'web', 'dist', 'agrolens-web', 'browser'));

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.getOrThrow<number>('THROTTLE_DEFAULT_TTL_MS'),
          limit: config.getOrThrow<number>('THROTTLE_DEFAULT_LIMIT'),
        },
      ],
    }),
    ServeStaticModule.forRoot({
      rootPath: webDistPath,
      exclude: ['/api/{*path}', '/docs', '/docs/{*path}'],
      serveStaticOptions: {
        fallthrough: true,
        setHeaders: (response, filePath) => {
          if (filePath.endsWith('/index.html') || filePath.endsWith('/ngsw.json')) {
            response.setHeader('Cache-Control', 'no-cache');
            return;
          }
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      },
    }),
    AppConfigModule,
    MailModule,
    DatabaseModule,
    StorageModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    UploadsModule,
    ImageProcessingModule,
    WorkerModule,
    AdminJobsModule,
    UsersModule,
    AccessModule,
    AuditModule,
    AnnotationsModule,
    InferenceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
