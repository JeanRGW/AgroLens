import { JobsRepository } from '../../../src/database/repositories/jobs.repository';
import { sqlText } from '../../sql-text';

describe('JobsRepository.retryDeadFinalizationJob', () => {
  interface Handle {
    repository: JobsRepository;
    tx: Record<string, jest.Mock>;
    order: string[];
  }

  /**
   * Fake transaction: consecutive `execute` calls consume `executeResults` in
   * order (each entry is the row list for one call). Statement text is logged
   * so lock ordering can be asserted.
   */
  function makeHandle(executeResults: unknown[][]): Handle {
    const order: string[] = [];
    let call = 0;
    const tx: Record<string, jest.Mock> = {
      execute: jest.fn(async (query: unknown) => {
        const text = sqlText(query);
        order.push(text);
        return executeResults[call++] ?? [];
      }),
    };
    const db = {
      transaction: jest.fn(async (callback: (t: never) => Promise<unknown>) =>
        callback(tx as never),
      ),
    };
    return { repository: new JobsRepository(db as never), tx, order };
  }

  // Row list for the locked failed upload read.
  const failedUploadRows = [
    {
      length: 1,
      user_id: 'user-1',
      status: 'failed',
      deleted_at: null,
    },
  ];

  it('locks the upload before the job row and restores both', async () => {
    const handle = makeHandle([
      [{ upload_id: 'upload-1' }], // job lookup (unlocked)
      failedUploadRows, // upload row lock + state read
      [{ status: 'dead' }], // job row lock
      [], // no other active job
    ]);

    await expect(handle.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'requeued',
    });

    const lockUpload = handle.order.findIndex((s) =>
      s.includes('FROM uploads WHERE id = upload-1 FOR UPDATE'),
    );
    const lockJob = handle.order.findIndex((s) =>
      s.includes('FROM upload_finalization_jobs WHERE id = job-1 FOR UPDATE'),
    );
    expect(lockUpload).toBeGreaterThanOrEqual(0);
    expect(lockJob).toBeGreaterThan(lockUpload);

    // Restore statements executed within the same transaction.
    const texts = handle.order.join('\n');
    expect(texts).toContain("SET status = 'finalizing', error_message = NULL");
    expect(texts).toContain("SET status = 'pending', attempts = 0, retry_after = NOW()");
  });

  it('returns upload_not_retryable when the upload is soft-deleted', async () => {
    const handle = makeHandle([
      [{ upload_id: 'upload-1' }],
      [
        {
          length: 1,
          user_id: 'user-1',
          status: 'failed',
          deleted_at: new Date(),
        },
      ],
      [{ status: 'dead' }],
    ]);

    await expect(handle.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'upload_not_retryable',
      uploadStatus: 'deleted',
    });
  });

  it('returns upload_not_retryable when the upload is no longer failed', async () => {
    const handle = makeHandle([
      [{ upload_id: 'upload-1' }],
      [
        {
          length: 1,
          user_id: 'user-1',
          status: 'ready',
        },
      ],
      [{ status: 'dead' }],
    ]);

    await expect(handle.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'upload_not_retryable',
      uploadStatus: 'ready',
    });
  });

  it('returns active_job_exists when another pending/running job covers the upload', async () => {
    const handle = makeHandle([
      [{ upload_id: 'upload-1' }],
      failedUploadRows,
      [{ status: 'dead' }],
      [{ id: 'other-job' }], // active sibling job
    ]);

    await expect(handle.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'active_job_exists',
    });
  });

  it('returns not_dead when the job is not in the dead state', async () => {
    const handle = makeHandle([
      [{ upload_id: 'upload-1' }],
      failedUploadRows,
      [{ status: 'running' }],
    ]);

    await expect(handle.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'not_dead',
    });
  });

  it('returns not_found when the job or upload does not exist', async () => {
    const missingJob = makeHandle([[]]);
    await expect(missingJob.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'not_found',
    });

    const missingUpload = makeHandle([[{ upload_id: 'upload-1' }], []]);
    await expect(missingUpload.repository.retryDeadFinalizationJob('job-1')).resolves.toEqual({
      status: 'not_found',
    });
  });
});

describe('JobsRepository.touchFinalizationJob', () => {
  it('updates locked_at when running job matches id and token', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'job-1' }]);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const repository = new JobsRepository({ update } as any);

    const result = await repository.touchFinalizationJob('job-1', 'token-1');

    expect(result).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ lockedAt: expect.any(Date) });
  });

  it('returns false when no rows were updated', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const repository = new JobsRepository({ update } as any);

    const result = await repository.touchFinalizationJob('job-1', 'stale-token');

    expect(result).toBe(false);
  });
});
