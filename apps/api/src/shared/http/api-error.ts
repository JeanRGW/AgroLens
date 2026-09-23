import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

@Catch(HttpException)
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  // NOTE: intentionally not registered globally yet. Enabling it changes the
  // error wire shape (validation arrays become joined strings plus timestamp
  // and path), which mobile's ApiException parsing and API e2e depend on.
  // Register only as part of a dedicated error-contract change.
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message = exception.message;
    let error: string | undefined;
    let details: unknown;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resObj = exceptionResponse as Record<string, unknown>;
      if (typeof resObj['message'] === 'string') {
        message = resObj['message'];
      } else if (Array.isArray(resObj['message'])) {
        message = resObj['message'].join(', ');
        details = resObj['message'];
      }
      if (typeof resObj['error'] === 'string') {
        error = resObj['error'];
      }
      if (resObj['errors']) {
        details = resObj['errors'];
      }
    }

    const body: ApiError = {
      statusCode: status,
      message,
      ...(error ? { error } : {}),
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
    };

    response.status(status).json(body);
  }
}
