import { WorkerObservabilityRepository } from '../../../src/database/repositories/worker-observability.repository';
import { sqlText } from '../../sql-text';

describe('WorkerObservabilityRepository', () => {
  describe('getHealth', () => {
    it('executes queue summary query', async () => {
      const execute = jest.fn().mockResolvedValue([]);
      const repository = new WorkerObservabilityRepository({ execute } as any);

      await repository.getHealth(900000, 1);

      expect(execute).toHaveBeenCalledTimes(1);
      const query = sqlText(execute.mock.calls[0][0]);
      expect(query).toContain('upload_finalization_jobs');
      expect(query).toContain('object_deletion_jobs');
      expect(query).toContain('inference_models');
      expect(query).toContain('inference_job_images');
    });

    it('reports ok when queues are within thresholds', async () => {
      const execute = jest.fn().mockResolvedValue([
        {
          queue: 'upload_finalization',
          depth: 2,
          dead_count: 0,
          max_attempts: 1,
          oldest_pending_age_ms: '5000',
          last_error: null,
        },
      ]);
      const repository = new WorkerObservabilityRepository({ execute } as any);

      const health = await repository.getHealth(900000, 1);
      expect(health.status).toBe('ok');
      expect(health.queues).toHaveLength(1);
      expect(health.queues[0].queue).toBe('upload_finalization');
    });

    it('reports unhealthy when oldest pending job exceeds threshold', async () => {
      const execute = jest.fn().mockResolvedValue([
        {
          queue: 'upload_finalization',
          depth: 1,
          dead_count: 0,
          max_attempts: 1,
          oldest_pending_age_ms: '900001',
          last_error: null,
        },
      ]);
      const repository = new WorkerObservabilityRepository({ execute } as any);

      const health = await repository.getHealth(900000, 1);
      expect(health.status).toBe('unhealthy');
    });

    it('reports unhealthy when dead job count reaches threshold', async () => {
      const execute = jest.fn().mockResolvedValue([
        {
          queue: 'object_deletion',
          depth: 0,
          dead_count: 1,
          max_attempts: 3,
          oldest_pending_age_ms: '0',
          last_error: 'S3 error',
        },
      ]);
      const repository = new WorkerObservabilityRepository({ execute } as any);

      const health = await repository.getHealth(900000, 1);
      expect(health.status).toBe('unhealthy');
    });

    it('sanitizes queue last_error messages', async () => {
      const execute = jest.fn().mockResolvedValue([
        {
          queue: 'upload_finalization',
          depth: 0,
          dead_count: 0,
          max_attempts: 0,
          oldest_pending_age_ms: '0',
          last_error: 'Error with secret=supersecret and token=12345',
        },
      ]);
      const repository = new WorkerObservabilityRepository({ execute } as any);

      const health = await repository.getHealth(900000, 1);
      expect(health.queues[0].last_error).not.toContain('supersecret');
      expect(health.queues[0].last_error).not.toContain('12345');
    });
  });
});
