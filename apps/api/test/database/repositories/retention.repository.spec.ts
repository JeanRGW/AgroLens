import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { RetentionRepository } from '../../../src/database/repositories/retention.repository';

const dialect = new PgDialect();

describe('RetentionRepository', () => {
  const cutoff = '2026-01-03T00:00:00.000Z';
  let execute: jest.Mock;
  let repository: RetentionRepository;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue([]);
    repository = new RetentionRepository({ execute } as any);
  });

  it('runs one bounded delete per table with the retention cutoff', async () => {
    await repository.pruneExpired(cutoff, 20);

    expect(execute).toHaveBeenCalledTimes(4);
    const rendered = execute.mock.calls.map(([query]) => dialect.sqlToQuery(query as SQL).sql);

    // Only non-active rows are eligible: expired/revoked
    // tokens, terminal jobs, and old audit events.
    expect(rendered[0]).toContain('DELETE FROM refresh_tokens');
    expect(rendered[0]).toContain('expires_at <= $');
    expect(rendered[0]).toContain('::timestamptz OR revoked_at <= $');
    expect(rendered[1]).toContain('DELETE FROM upload_finalization_jobs');
    expect(rendered[1]).toContain("status IN ('completed', 'dead')");
    expect(rendered[1]).toContain('completed_at <= $');
    expect(rendered[2]).toContain('DELETE FROM object_deletion_jobs');
    expect(rendered[2]).toContain("status = 'completed'");
    expect(rendered[2]).toContain('completed_at <= $');
    expect(rendered[3]).toContain('DELETE FROM audit_events');
    expect(rendered[3]).toContain('created_at <= $');
    for (const statement of rendered) {
      expect(statement).toMatch(/LIMIT \$\d+/);
    }

    // Cutoff applies to the retention-driven tables; the batch limit to all.
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).params).toEqual([cutoff, cutoff, 20]);
    expect(dialect.sqlToQuery(execute.mock.calls[1][0]).params).toEqual([cutoff, 20]);
    expect(dialect.sqlToQuery(execute.mock.calls[2][0]).params).toEqual([cutoff, 20]);
    expect(dialect.sqlToQuery(execute.mock.calls[3][0]).params).toEqual([cutoff, 20]);
  });

  it('summarizes deleted rows per table', async () => {
    execute.mockImplementation((query: unknown) =>
      Promise.resolve(
        dialect.sqlToQuery(query as SQL).sql.includes('refresh_tokens') ? [1, 2] : [1],
      ),
    );

    await expect(repository.pruneExpired(cutoff, 20)).resolves.toEqual({
      refreshTokens: 2,
      finalizationJobs: 1,
      deletionJobs: 1,
      auditEvents: 1,
    });
  });
});
