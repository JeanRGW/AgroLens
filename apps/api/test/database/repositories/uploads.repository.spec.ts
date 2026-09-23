import { UploadsRepository } from '../../../src/database/repositories/uploads.repository';

describe('UploadsRepository', () => {
  describe('cleanupAbandoned', () => {
    it.each(['draft', 'failed'] as const)(
      'serializes %s cutoff before raw SQL execution',
      async (status) => {
        const execute = jest.fn().mockResolvedValue([]);
        const tx = { execute };
        const db = {
          transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) =>
            callback(tx),
          ),
        };
        const repository = new UploadsRepository(db as any);
        const olderThan = new Date('2026-07-20T01:02:03.000Z');

        await expect(repository.cleanupAbandoned(status, olderThan, 10)).resolves.toEqual({
          deleted: 0,
          skipped: 0,
          enqueuedObjects: 0,
        });

        const query = execute.mock.calls[0][0];
        expect(query.queryChunks).toContain(olderThan.toISOString());
        expect(query.queryChunks).not.toContain(olderThan);
      },
    );
  });

  describe('countWhereEnriched', () => {
    it('joins user and catalog tables so search conditions can reference them', async () => {
      const db: Record<string, any> = {};
      db.select = jest.fn(() => db);
      db.from = jest.fn(() => db);
      db.leftJoin = jest.fn(() => db);
      db.innerJoin = jest.fn(() => db);
      db.where = jest.fn(() => db);
      // Drizzle query builders are thenable; resolve the awaited chain with our stub row.
      db.then = (resolve: (value: unknown) => void) => {
        resolve([{ count: 3 }]);
      };

      const repository = new UploadsRepository(db as any);
      await repository.countWhereEnriched(undefined);

      expect(db.leftJoin).toHaveBeenCalledTimes(4);
      expect(db.innerJoin).toHaveBeenCalledTimes(1);
      const joinedTables = [...db.leftJoin.mock.calls, ...db.innerJoin.mock.calls].map(
        (call) => call[0],
      );
      expect(
        joinedTables.map((table) => String(table[Symbol.for('drizzle:Name')] ?? table.name)),
      ).toEqual(
        expect.arrayContaining(['users', 'properties', 'talhoes', 'crop_types', 'estadios']),
      );
    });
  });
});
