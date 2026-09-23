import { UsersRepository } from '../../../src/database/repositories/users.repository';

function query(result: unknown[] | Error) {
  const builder: Record<string, any> = {
    from: jest.fn(() => builder),
    for: jest.fn(() => builder),
    set: jest.fn(() => builder),
    values: jest.fn(() => builder),
    where: jest.fn(() => builder),
    returning: jest.fn(() => builder),
    then(resolve: (value: unknown[]) => void, reject: (reason: Error) => void) {
      if (result instanceof Error) reject(result);
      else resolve(result);
    },
  };
  return builder;
}

describe('UsersRepository.replaceRefreshToken', () => {
  it('runs revoke, insert, and successor linking on one transaction', async () => {
    const oldTokenId = 'old-token';
    const replacement = { id: 'new-token', tokenHash: 'hash' };
    const revoke = query([{ id: oldTokenId }]);
    const insert = query([replacement]);
    const link = query([]);
    const tx = {
      select: jest.fn(() => query([{ id: 'user-id' }])),
      update: jest.fn().mockReturnValueOnce(revoke).mockReturnValueOnce(link),
      insert: jest.fn().mockReturnValue(insert),
    };
    const db = {
      transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(tx)),
      update: jest.fn(),
      insert: jest.fn(),
    };
    const repo = new UsersRepository(db as any);

    await expect(repo.replaceRefreshToken(oldTokenId, replacement as any)).resolves.toBe(
      replacement,
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns undefined without inserting when the old token is already revoked', async () => {
    const revoke = query([]);
    const tx = {
      select: jest.fn(() => query([{ id: 'user-id' }])),
      update: jest.fn().mockReturnValue(revoke),
      insert: jest.fn(),
    };
    const db = {
      transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(tx)),
    };
    const repo = new UsersRepository(db as any);

    await expect(
      repo.replaceRefreshToken('old-token', { id: 'new-token' } as any),
    ).resolves.toBeUndefined();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('rejects when a transaction write fails', async () => {
    const failure = new Error('link failed');
    const tx = {
      select: jest.fn(() => query([{ id: 'user-id' }])),
      update: jest
        .fn()
        .mockReturnValueOnce(query([{ id: 'old-token' }]))
        .mockReturnValueOnce(query(failure)),
      insert: jest.fn().mockReturnValue(query([{ id: 'new-token' }])),
    };
    const db = {
      transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(tx)),
    };
    const repo = new UsersRepository(db as any);

    await expect(repo.replaceRefreshToken('old-token', { id: 'new-token' } as any)).rejects.toBe(
      failure,
    );
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });
});
