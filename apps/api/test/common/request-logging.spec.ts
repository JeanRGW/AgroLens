import { Logger } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import { requestLogging } from '../../src/common/request-logging';

describe('requestLogging', () => {
  it('logs the pathname and status without leaking query credentials', async () => {
    const log = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    try {
      const app = express();
      app.use(requestLogging);
      app.get('/reset-password', (_req, res) => res.sendStatus(200));

      const response = await request(app)
        .get('/reset-password?token=secret-reset-token&other=sensitive')
        .expect(200);

      expect(log).toHaveBeenCalledWith(
        `GET /reset-password 200 request_id=${response.headers['x-request-id']}`,
        'Http',
      );
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-reset-token|sensitive|token=/);
    } finally {
      log.mockRestore();
    }
  });
});
