import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['log', 'error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  const config = app.get(ConfigService);

  if (!config.get<boolean>('WORKER_ENABLED', false)) {
    await app.close();
    return;
  }

  app.enableShutdownHooks();
  Logger.log('Standalone worker process initialized.', 'Worker');
}

void bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'Unknown worker bootstrap error', 'Worker');
  process.exitCode = 1;
});
