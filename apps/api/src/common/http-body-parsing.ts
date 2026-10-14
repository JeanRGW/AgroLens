import type { INestApplication } from '@nestjs/common';
import { json } from 'express';

export function configureJsonBodyParsing(app: INestApplication, apiPrefix: string): void {
  // Full review snapshots can exceed Express's default 100 KiB body limit.
  app.use(`/${apiPrefix}/inference/jobs/:id/images/:imageId/review`, json({ limit: '1mb' }));
  // Nest detects parsers by name, including the scoped one, so install the fallback explicitly.
  app.use(json());
}
