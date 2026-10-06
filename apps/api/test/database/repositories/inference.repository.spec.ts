import { InferenceRepository } from '../../../src/database/repositories/inference.repository';
import { InferenceModelsRepository } from '../../../src/database/repositories/inference-models.repository';
import { PgDialect } from 'drizzle-orm/pg-core';
import { objectDeletionJobs } from '../../../src/database/schema';
import { ConfigService } from '@nestjs/config';

/**
 * Unit tests for InferenceRepository.
 *
 * Mock strategy: a plain object where every Drizzle query-builder method
 * (select, from, insert, values, where, limit, orderBy, etc.) is a
 * jest.fn() that returns the mock itself for chaining.
 *
 * The mock is also thenable — awaiting it drains a pre-loaded result
 * queue.  Tests push results onto the queue before calling repository
 * methods that use the chaining pattern.
 *
 * db.execute and db.transaction are separate jest.fn() singletons
 * (overridden on the mock after construction) so raw-SQL claim methods
 * can be verified independently.
 *
 * Cannot unit-test:
 *  - Real FOR UPDATE SKIP LOCKED concurrency
 *  - Counter recomputation atomicity under concurrent completions
 *  - PG FK / cascade behaviour
 * (need integration tests against a real database)
 */

// ── Row builders ────────────────────────────────────────────────────────

function rawImageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'img-1',
    jobId: 'job-1',
    imageIndex: 0,
    fileName: 'img_001.jpg',
    sourceObjectKey: 'tmp/img_001.jpg',
    width: 1920,
    height: 1080,
    status: 'queued',
    detections: null,
    inferenceMs: null,
    attempts: 0,
    errorMessage: null,
    createdAt: new Date('2026-07-03T04:50:00Z'),
    updatedAt: new Date('2026-07-03T04:50:00Z'),
    ...overrides,
  };
}

function rawModelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'model-1',
    name: 'yolo-v8',
    description: 'Test model',
    objectKey: 'models/yolo.pt',
    sizeBytes: 12_345_678,
    sha256: null,
    status: 'uploading',
    active: false,
    task: 'detection',
    classes: null,
    validationAttempts: 0,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-07-03T04:50:00Z'),
    updatedAt: new Date('2026-07-03T04:50:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

// ── Chainable mock factory ──────────────────────────────────────────────

/**
 * Build a plain object where every method returns `self`.  The object
 * has a `.then` that drains a result queue so it can be awaited.
 */
function makeMock() {
  const queue: unknown[][] = [];

  const self: Record<string, any> = {
    // Thenable contract
    then(resolve: (v: unknown) => void) {
      resolve(queue.shift() ?? []);
      return self;
    },
    pushResult(v: unknown[]) {
      queue.push(v);
    },
  };

  // All Drizzle builder methods → return self for chaining
  const methods = [
    'select',
    'from',
    'insert',
    'values',
    'returning',
    'update',
    'set',
    'delete',
    'where',
    'orderBy',
    'limit',
    'offset',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'for',
    // Extra: some Drizzle internals call these
    'onConflictDoNothing',
  ];
  for (const m of methods) {
    self[m] = jest.fn(() => self);
  }

  return self;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('InferenceRepository', () => {
  let repo: InferenceRepository;
  let models: InferenceModelsRepository;
  let db: ReturnType<typeof makeMock>;
  let executeRaw: jest.Mock;
  let txMock: jest.Mock;

  function push(v: unknown[]) {
    db.pushResult(v);
  }

  beforeEach(() => {
    db = makeMock();
    executeRaw = jest.fn();
    txMock = jest.fn();

    // Override on the mock — these take priority since they're own props
    db.execute = executeRaw;
    db.transaction = txMock;

    repo = new InferenceRepository(db as any, new ConfigService());
    models = new InferenceModelsRepository(db as any, new ConfigService());
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Model CRUD
  // ═══════════════════════════════════════════════════════════════════

  describe('createModel', () => {
    it('inserts and returns a model', async () => {
      push([rawModelRow()]);
      const r = await models.createModel({
        name: 'm',
        objectKey: 'k',
        sizeBytes: 100,
        createdByUserId: 'u',
      } as any);
      expect(r).toMatchObject({ id: 'model-1', name: 'yolo-v8' });
    });
  });

  describe('findModelById', () => {
    it('returns the model for a non-deleted id', async () => {
      push([rawModelRow()]);
      const r = await models.findModelById('model-1');
      expect(r).toBeDefined();
      expect(r!.id).toBe('model-1');
    });

    it('returns undefined when not found', async () => {
      push([]);
      expect(await models.findModelById('missing')).toBeUndefined();
    });
  });

  describe('listActiveModels', () => {
    it('returns ready + active models', async () => {
      push([rawModelRow({ status: 'ready', active: true })]);
      const r = await models.listActiveModels();
      expect(r).toHaveLength(1);
    });
  });

  describe('updateModel', () => {
    it('updates and returns the model', async () => {
      push([rawModelRow({ status: 'ready' })]);
      const r = await models.updateModel('model-1', { status: 'ready' });
      expect(r!.status).toBe('ready');
    });
  });

  describe('softDeleteModel', () => {
    beforeEach(() => {
      txMock.mockImplementation(async (callback) => callback(db));
    });

    it('sets deletedAt and returns', async () => {
      const before = Date.now();
      push([rawModelRow()]);
      push([]);
      push([rawModelRow({ deletedAt: new Date() })]);
      const r = await models.softDeleteModel('model-1');
      expect(r!.deletedAt).toBeInstanceOf(Date);
      expect(db.values.mock.calls[0][0].runAfter.getTime()).toBeGreaterThanOrEqual(
        before + 24 * 3600000,
      );
    });

    it('returns undefined for already-deleted', async () => {
      push([]);
      expect(await models.softDeleteModel('gone')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Stale validation claim (raw SQL via execute)
  // ═══════════════════════════════════════════════════════════════════

  describe('claimValidation', () => {
    it('executes atomic UPDATE…RETURNING with FOR UPDATE SKIP LOCKED', async () => {
      executeRaw.mockResolvedValue([rawModelRow({ status: 'validating', validation_attempts: 1 })]);

      const r = await models.claimValidation();
      expect(r).toBeDefined();
      expect(r!.id).toBe('model-1');
      expect(executeRaw).toHaveBeenCalledTimes(2);

      const chunks: any[] = executeRaw.mock.calls[1][0].queryChunks ?? [];
      const text = chunks
        .map((c: any) => (typeof c === 'string' ? c : (c?.value?.join('') ?? '')))
        .join('');
      expect(text).toContain('FOR UPDATE');
      expect(text).toContain('SKIP LOCKED');
      expect(text).toContain("status = 'validating'");
    });

    it('returns undefined when nothing eligible', async () => {
      executeRaw.mockResolvedValue([]);
      expect(await models.claimValidation()).toBeUndefined();
    });

    it('contains stale updated_at threshold in the SQL', async () => {
      executeRaw.mockResolvedValue([rawModelRow({ status: 'validating', validation_attempts: 0 })]);
      await models.claimValidation();
      expect(executeRaw).toHaveBeenCalledTimes(2);

      const chunks: any[] = executeRaw.mock.calls[1][0].queryChunks ?? [];
      const text = chunks
        .map((c: any) => (typeof c === 'string' ? c : (c?.value?.join('') ?? '')))
        .join('');
      expect(text).toContain('updated_at');
      expect(text).toContain('::timestamptz');
    });
  });

  it('fails exhausted images through fenced failure and counter recomputation', async () => {
    push([{ id: 'exhausted-image', attempts: 3 }]);
    const fail = jest.spyOn(repo, 'failImage').mockResolvedValue(undefined);
    await repo.failExhaustedImages(3);
    expect(fail).toHaveBeenCalledWith(
      'exhausted-image',
      'inference lease expired at max attempts',
      3,
    );
    const predicate = sqlToText(db.where.mock.calls[0][0]);
    expect(predicate).toContain('>=');
    expect(db.limit).toHaveBeenCalledWith(20);
  });

  describe('hasActiveJobsForModel', () => {
    it('returns true when count > 0', async () => {
      push([{ count: 3 }]);
      expect(await models.hasActiveJobsForModel('model-1')).toBe(true);
    });

    it('returns false when count = 0', async () => {
      push([{ count: 0 }]);
      expect(await models.hasActiveJobsForModel('model-1')).toBe(false);
    });

    it('returns true when queued/running/uploading jobs exist (non-terminal)', async () => {
      push([{ count: 1 }]);
      expect(await models.hasActiveJobsForModel('model-1')).toBe(true);
    });

    it('returns false when only completed/failed jobs exist', async () => {
      push([{ count: 0 }]);
      expect(await models.hasActiveJobsForModel('model-1')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Job CRUD
  // ═══════════════════════════════════════════════════════════════════

  describe('createJobWithImages', () => {
    it('inserts job and images inside a transaction', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.execute = executeRaw;
        tx.transaction = txMock;
        tx.pushResult([{ id: 'm' }]); // locked available model
        tx.pushResult([{ id: 'job-1', status: 'uploading' }]); // job insert
        tx.pushResult([]); // image inserts
        return cb(tx);
      });

      const r = await repo.createJobWithImages(
        { userId: 'u', modelId: 'm', modelSnapshot: {}, sourceType: 'temporary' } as any,
        [{ imageIndex: 0, fileName: 'a.jpg', sourceObjectKey: 'k' } as any],
      );
      expect(r.id).toBe('job-1');
      expect(txMock).toHaveBeenCalled();
    });

    it('creates job without images when array is empty', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.execute = executeRaw;
        tx.transaction = txMock;
        tx.pushResult([{ id: 'm' }]); // locked available model
        tx.pushResult([{ id: 'job-2', status: 'uploading' }]);
        return cb(tx);
      });

      const r = await repo.createJobWithImages(
        {
          userId: 'u',
          modelId: 'm',
          modelSnapshot: {},
          sourceType: 'upload',
          uploadId: 'up',
        } as any,
        [],
      );
      expect(r.id).toBe('job-2');
    });
  });

  describe('findJobById', () => {
    it('returns the job', async () => {
      push([{ id: 'job-1', status: 'queued' }]);
      const r = await repo.findJobById('job-1');
      expect(r).toBeDefined();
      expect(r!.id).toBe('job-1');
    });
  });

  describe('listJobsByUserId', () => {
    it('filters by owner and expiry in both queries and paginates only the rows', async () => {
      push([{ id: 'job-1' }]);
      push([{ total: 21 }]);
      const r = await repo.listJobsByUserId('u', 20, 20);
      expect(r).toEqual({ jobs: [{ id: 'job-1' }], total: 21 });
      expect(db.limit).toHaveBeenCalledWith(20);
      expect(db.offset).toHaveBeenCalledWith(20);
      expect(db.orderBy).toHaveBeenCalledTimes(1);
      const predicates = db.where.mock.calls.map(([where]: [any]) =>
        new PgDialect().sqlToQuery(where),
      );
      expect(predicates).toHaveLength(2);
      expect(predicates[0].sql).toContain('"inference_jobs"."user_id" =');
      expect(predicates[0].sql).toContain('"inference_jobs"."expires_at" is null or');
      expect(predicates[0].sql).toContain('>=');
      expect(predicates[0].params[0]).toBe('u');
      expect(predicates[1]).toEqual(predicates[0]);
    });

    it('preserves the total on an empty page', async () => {
      push([]);
      push([{ total: 2 }]);
      expect(await repo.listJobsByUserId('u', 20, 20)).toEqual({ jobs: [], total: 2 });
    });
  });

  describe('findImageById', () => {
    it('constrains the image lookup to the job and image IDs', async () => {
      push([rawImageRow()]);
      expect((await repo.findImageById('job-1', 'img-1'))?.id).toBe('img-1');
      const query = new PgDialect().sqlToQuery(db.where.mock.calls[0][0]);
      expect(query.sql).toContain('"inference_job_images"."job_id" =');
      expect(query.sql).toContain('"inference_job_images"."id" =');
      expect(query.params).toEqual(['job-1', 'img-1']);
      expect(db.limit).toHaveBeenCalledWith(1);
    });

    it('returns undefined when the image does not belong to the job', async () => {
      push([]);
      expect(await repo.findImageById('job-1', 'other-image')).toBeUndefined();
    });
  });

  describe('listImagesByJobId', () => {
    it('returns images ordered by imageIndex', async () => {
      push([rawImageRow()]);
      const r = await repo.listImagesByJobId('job-1');
      expect(r).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  listQueuedJobIds — starvation fix (skip jobs with no claimable image)
  // ═══════════════════════════════════════════════════════════════════

  // Recursively flatten a Drizzle SQL object's queryChunks into a string so
  // we can assert the generated WHERE clause contains the claimability filter.
  function sqlToText(sqlObj: any): string {
    const chunks = sqlObj?.queryChunks ?? [];
    return chunks
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && Array.isArray(c.queryChunks)) return sqlToText(c);
        if (c && Array.isArray(c.value)) return c.value.join('');
        return '';
      })
      .join('');
  }

  describe('listQueuedJobIds', () => {
    it('returns jobs ordered by createdAt (oldest-eligible first)', async () => {
      push([{ id: 'job-1' }, { id: 'job-2' }]);
      const r = await repo.listQueuedJobIds(2);
      expect(r).toEqual(['job-1', 'job-2']);

      // orderBy was called with the ascending createdAt column reference
      const orderByArg = db.orderBy.mock.calls[0]?.[0];
      expect(orderByArg).toBeDefined();
    });

    it('skips jobs with no currently claimable image (regression: starvation fix)', async () => {
      push([]);
      await repo.listQueuedJobIds(1);

      const whereArg = db.where.mock.calls[0]?.[0];
      expect(whereArg).toBeDefined();

      const text = sqlToText(whereArg);
      // The starvation fix injects an EXISTS clause that only returns a job when
      // at least one of its images is claimable, using the same rule as claimNextImage.
      expect(text).toContain('EXISTS');
      // claimable queued branch (retry backoff respected) — render as literals
      expect(text).toContain("'queued'");
      expect(text).toContain('NOW()');
      expect(text).toContain('IS NULL');
      // claimable stale-running branch (recovery of hung workers)
      expect(text).toContain("'running'");
      expect(text).toContain('::timestamptz');
      // model readiness / non-deleted preconditions preserved
      expect(text).toContain('IN (');
    });

    it('regression: an older job in retry backoff must NOT block a newer eligible job', async () => {
      // The two jobs are identical in the SELECT/has-model sense — only image
      // claimability differs. The query must filter on claimability (EXISTS),
      // so the non-claimable older job is excluded and the eligible newer job
      // surfaces. We assert the generated SQL embeds the claimability rule;
      // without it the older job (queued status, model ready) would be returned
      // first and block the newer job from ever being dispatched.
      push([]);
      await repo.listQueuedJobIds(1);

      const whereArg = db.where.mock.calls[0]?.[0];
      const text = sqlToText(whereArg);

      // The queued branch only treats an image as claimable when retry_after is
      // NULL or already elapsed — a purely-backed-off image (retry_after in the
      // future) is NOT claimable, so the EXISTS guard excludes the job and it
      // cannot block the queue.
      expect(text).toMatch(/IS NULL OR .*<= NOW\(\)/);
      expect(text).toContain('EXISTS');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Atomic image claim (raw SQL via execute)
  // ═══════════════════════════════════════════════════════════════════

  describe('claimNextImage', () => {
    it('claims a queued image atomically with FOR UPDATE SKIP LOCKED', async () => {
      executeRaw.mockResolvedValue([rawImageRow()]);

      const r = await repo.claimNextImage('job-1', 3);
      expect(r).toBeDefined();
      expect(r!.id).toBe('img-1');
      expect(executeRaw).toHaveBeenCalledTimes(1);

      const chunks: any[] = executeRaw.mock.calls[0][0].queryChunks ?? [];
      const text = chunks
        .map((c: any) => (typeof c === 'string' ? c : (c?.value?.join('') ?? '')))
        .join('');
      expect(text).toContain('FOR UPDATE');
      expect(text).toContain('SKIP LOCKED');
      expect(text).toContain("status = 'running'");
    });

    it('claims a stale running image (updated_at > threshold)', async () => {
      executeRaw.mockResolvedValue([
        rawImageRow({
          status: 'running',
          updated_at: new Date(Date.now() - 20 * 60 * 1000),
        }),
      ]);
      const r = await repo.claimNextImage('job-1', 3);
      expect(r).toBeDefined();
      expect(executeRaw).toHaveBeenCalled();
    });

    it('returns undefined when nothing to claim', async () => {
      executeRaw.mockResolvedValue([]);
      expect(await repo.claimNextImage('job-1', 3)).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Image completion / failure
  // ═══════════════════════════════════════════════════════════════════

  describe('completeImage', () => {
    it('marks image completed and recomputes job counters via transaction', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.pushResult([{ ...rawImageRow(), status: 'completed', jobId: 'job-1' }]);
        tx.pushResult([{ imageCount: 5 }]); // job (FOR UPDATE lock)
        tx.pushResult([{ count: 5 }]); // completed
        tx.pushResult([{ count: 0 }]); // failed
        tx.pushResult([]); // update
        return cb(tx);
      });

      const r = await repo.completeImage('img-1', { detections: null, inferenceMs: 42 }, 1);
      expect(r!.status).toBe('completed');
      expect(txMock).toHaveBeenCalled();
    });

    it('clears stale errorMessage on successful completion', async () => {
      // Image carries a leftover errorMessage from a previous retry failure.
      push([
        {
          ...rawImageRow(),
          status: 'completed',
          jobId: 'job-1',
          errorMessage: 'previous retry timeout',
        },
      ]);

      const setCalls: Record<string, unknown>[] = [];
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        const origUpdate = tx.update;
        tx.update = jest.fn((...args: any[]) => {
          const chain = origUpdate(...args);
          chain.set = jest.fn((data: Record<string, unknown>) => {
            setCalls.push(data);
            return chain;
          });
          return chain;
        });
        // Order consumed by the transaction:
        tx.pushResult([{ ...rawImageRow(), status: 'completed', jobId: 'job-1' }]); // image update .returning()
        tx.pushResult([{ imageCount: 5 }]); // job (FOR UPDATE lock)
        tx.pushResult([{ count: 5 }]); // completed count
        tx.pushResult([{ count: 0 }]); // failed count
        return cb(tx);
      });

      const r = await repo.completeImage('img-1', { detections: null, inferenceMs: 42 }, 1);
      expect(r!.status).toBe('completed');

      // The image-row update (carries inferenceMs) must clear errorMessage.
      const imageSet = setCalls.find((s) => 'inferenceMs' in s);
      expect(imageSet).toBeDefined();
      expect(imageSet!.errorMessage).toBeNull();
    });

    it('does not recompute counters when the claim attempt no longer matches', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.pushResult([]);
        return cb(tx);
      });

      expect(
        await repo.completeImage('img-1', { detections: null, inferenceMs: 42 }, 1),
      ).toBeUndefined();
    });
  });

  describe('failImage', () => {
    it('marks image failed with error and recomputes', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.pushResult([
          { ...rawImageRow(), status: 'failed', jobId: 'job-1', errorMessage: 'timeout' },
        ]);
        tx.pushResult([{ imageCount: 5 }]); // job (FOR UPDATE lock)
        tx.pushResult([{ count: 4 }]); // completed
        tx.pushResult([{ count: 1 }]); // failed
        tx.pushResult([]); // update
        return cb(tx);
      });

      const r = await repo.failImage('img-1', 'timeout', 1);
      expect(r!.status).toBe('failed');
      expect(r!.errorMessage).toBe('timeout');
      expect(txMock).toHaveBeenCalled();
    });
  });

  // ── recomputeJobCounters status logic (tested via completeImage) ───

  describe('recomputeJobCounters', () => {
    it('sets job to completed when some images completed and some failed (partial success)', async () => {
      let setData: Record<string, unknown> | null = null;
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        const origUpdate = tx.update;
        tx.update = jest.fn((...args: any[]) => {
          const chain = origUpdate(...args);
          chain.set = jest.fn((data: Record<string, unknown>) => {
            setData = data;
            return chain;
          });
          return chain;
        });
        tx.pushResult([{ ...rawImageRow(), status: 'completed', jobId: 'job-1' }]);
        tx.pushResult([{ imageCount: 2 }]); // job (FOR UPDATE lock)
        tx.pushResult([{ count: 1 }]); // completed = 1
        tx.pushResult([{ count: 1 }]); // failed = 1
        tx.pushResult([]); // update
        return cb(tx);
      });

      await repo.completeImage('img-1', { detections: null, inferenceMs: 42 }, 1);
      expect(txMock).toHaveBeenCalled();
      expect(setData).not.toBeNull();
      expect(setData!.status).toBe('completed');
    });

    it('sets job to failed when all images failed', async () => {
      let setData: Record<string, unknown> | null = null;
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        const origUpdate = tx.update;
        tx.update = jest.fn((...args: any[]) => {
          const chain = origUpdate(...args);
          chain.set = jest.fn((data: Record<string, unknown>) => {
            setData = data;
            return chain;
          });
          return chain;
        });
        tx.pushResult([{ ...rawImageRow(), status: 'completed', jobId: 'job-1' }]);
        tx.pushResult([{ imageCount: 2 }]); // job (FOR UPDATE lock)
        tx.pushResult([{ count: 0 }]); // completed = 0
        tx.pushResult([{ count: 2 }]); // failed = 2
        tx.pushResult([]); // update
        return cb(tx);
      });

      await repo.completeImage('img-1', { detections: null, inferenceMs: 42 }, 1);
      expect(txMock).toHaveBeenCalled();
      expect(setData).not.toBeNull();
      expect(setData!.status).toBe('failed');
    });
  });

  describe('findExpiredJobs', () => {
    it('returns uploading jobs with past expiresAt', async () => {
      push([{ id: 'exp-1', status: 'uploading' }]);
      const r = await repo.findExpiredJobs(10);
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('uploading');
    });

    it('returns completed jobs with past expiresAt', async () => {
      push([{ id: 'exp-2', status: 'completed' }]);
      const r = await repo.findExpiredJobs(10);
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('completed');
    });

    it('returns failed jobs with past expiresAt', async () => {
      push([{ id: 'exp-3', status: 'failed' }]);
      const r = await repo.findExpiredJobs(10);
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('failed');
    });

    it('does NOT return queued or running jobs', async () => {
      // The WHERE clause filters out queued/running; empty result simulates no matches.
      push([]);
      const r = await repo.findExpiredJobs(10);
      expect(r).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Delete job (transactional)
  // ═══════════════════════════════════════════════════════════════════

  describe('deleteJob', () => {
    it('deletes temporary jobs and queues their keys in the transaction', async () => {
      const before = Date.now();
      const job = { id: 'job-1', sourceType: 'temporary', userId: 'u', status: 'completed' };
      const tx = makeMock();
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        tx.pushResult([job]); // select job
        tx.pushResult([{ sourceObjectKey: 'tmp/k1.jpg' }, { sourceObjectKey: 'tmp/k2.jpg' }]); // select keys
        tx.pushResult([]); // delete job
        return cb(tx);
      });

      const r = await repo.deleteJob('job-1');
      expect(r).toBe(job);
      expect(tx.insert).toHaveBeenCalledWith(objectDeletionJobs);
      expect(tx.values).toHaveBeenCalledWith([
        { objectKey: 'tmp/k1.jpg', runAfter: expect.any(Date) },
        { objectKey: 'tmp/k2.jpg', runAfter: expect.any(Date) },
      ]);
      expect(tx.values.mock.calls[0][0][0].runAfter.getTime()).toBeGreaterThanOrEqual(
        before + 900000,
      );
    });

    it('deletes upload-based jobs without queuing their originals for deletion', async () => {
      const job = { id: 'job-1', sourceType: 'upload', userId: 'u', status: 'completed' };
      const tx = makeMock();
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        tx.pushResult([job]);
        tx.pushResult([]); // delete job
        return cb(tx);
      });

      const r = await repo.deleteJob('job-1');
      expect(r).toBe(job);
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it('returns undefined job when not found', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.pushResult([]); // no job
        return cb(tx);
      });

      const r = await repo.deleteJob('missing');
      expect(r).toBeUndefined();
    });

    it('does not delete a queued job', async () => {
      txMock.mockImplementation(async (cb: (tx: any) => any) => {
        const tx = makeMock();
        tx.pushResult([{ id: 'job-1', sourceType: 'upload', status: 'queued' }]);
        return cb(tx);
      });

      expect(await repo.deleteJob('job-1')).toBeUndefined();
    });
  });
});
