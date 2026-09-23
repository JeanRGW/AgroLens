import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
    randomUUID();
  // Query strings can contain credentials, including password-reset tokens.
  const pathname = req.originalUrl.split('?')[0];
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    Logger.log(`${req.method} ${pathname} ${res.statusCode} request_id=${requestId}`, 'Http');
  });
  next();
}
