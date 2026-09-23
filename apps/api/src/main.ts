import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { runMigrations } from './cli/migrate';
import { resolveTrustProxy } from './config/env.schema';
import { requestLogging } from './common/request-logging';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['log', 'error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  try {
    await runMigrations();

    const configService = app.get(ConfigService);

    // Trust only the proxy hops configured via TRUST_PROXY (default: one hop,
    // the host Caddy that overwrites forwarded headers). Unset or "false"
    // keeps Express from honoring client-forged X-Forwarded-* headers.
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', resolveTrustProxy(configService.get<string>('TRUST_PROXY')));

    const port = configService.get<number>('PORT', 3000);
    const apiPrefix = configService.get<string>('API_PREFIX', 'api');
    const corsOrigins = configService.get<string[]>('CORS_ORIGINS', []);
    const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', false);

    app.use(requestLogging);
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.removeHeader('X-Powered-By');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      next();
    });
    // Turn off the Express framework identification header at the adapter level too.
    app.getHttpAdapter().getInstance().disable('x-powered-by');
    app.enableShutdownHooks();

    // Global prefix
    app.setGlobalPrefix(apiPrefix);

    // CORS
    if (corsOrigins.length > 0) {
      app.enableCors({ origin: corsOrigins, credentials: true });
    }

    if (swaggerEnabled) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('AgroLens API')
        .setDescription(
          'Backend API for agricultural image capture, metadata, and access management',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('docs', app, document);
    }

    await app.listen(port);
    Logger.log(`API running on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
    if (swaggerEnabled) {
      Logger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
    }
  } catch (error: unknown) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'Unknown bootstrap error', 'Bootstrap');
  process.exitCode = 1;
});
