import { CatalogRepository } from '../../../src/database/repositories/catalog.repository';

function mockDb(countValue: number): { db: Record<string, any>; where: jest.Mock } {
  const where = jest.fn();
  const db: Record<string, any> = {};
  db.select = jest.fn(() => db);
  db.from = jest.fn(() => db);
  db.where = (...args: unknown[]) => {
    where(...args);
    return db;
  };
  // Drizzle query builders are thenable; resolve the awaited chain with our stub row.
  db.then = (resolve: (value: unknown) => void) => resolve([{ count: countValue }]);
  return { db, where };
}

describe('CatalogRepository counts', () => {
  it.each([
    ['countProperties', 5],
    ['countTalhoes', 7],
    ['countCropTypes', 3],
    ['countEstadios', 9],
  ] as const)('%s returns the row count', async (method, countValue) => {
    const { db } = mockDb(countValue);
    const repository = new CatalogRepository(db as any);
    await expect(repository[method]()).resolves.toBe(countValue);
    expect(db.select).toHaveBeenCalledWith({ count: expect.anything() });
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.where).toBeDefined();
  });

  it.each(['countProperties', 'countTalhoes', 'countCropTypes', 'countEstadios'] as const)(
    '%s falls back to 0 when no row is returned',
    async (method) => {
      const db: Record<string, any> = {};
      db.select = jest.fn(() => db);
      db.from = jest.fn(() => db);
      db.where = jest.fn(() => db);
      db.then = (resolve: (value: unknown) => void) => resolve([]);
      const repository = new CatalogRepository(db as any);
      await expect(repository[method]()).resolves.toBe(0);
    },
  );
});
