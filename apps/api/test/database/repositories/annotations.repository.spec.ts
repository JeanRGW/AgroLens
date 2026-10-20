import { ConflictException } from '@nestjs/common';
import type { DatabaseConnection } from '../../../src/database/database.constants';
import { AnnotationsRepository } from '../../../src/database/repositories/annotations.repository';
import { uploadImages, imageAnnotations } from '../../../src/database/schema';

describe('AnnotationsRepository versioned saves', () => {
  const data = {
    imageId: 'image-1',
    imageWidth: 100,
    imageHeight: 80,
    classes: ['weed'],
    labels: [],
  };
  const stamp = new Date('2026-10-14T10:00:00.000Z');

  function setup(existing?: { updatedAt: Date }) {
    const results: unknown[][] = [
      [{ id: data.imageId }],
      existing ? [existing] : [],
      [{ ...data, updatedAt: stamp }],
    ];
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      for: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      then(resolve: (value: unknown[]) => void) {
        resolve(results.shift() ?? []);
      },
    };
    const db = {
      transaction: jest.fn((callback: (tx: typeof builder) => Promise<unknown>) =>
        callback(builder),
      ),
    };
    const repo = new AnnotationsRepository(db as unknown as DatabaseConnection);
    return { repo, builder, db };
  }

  it('locks the stable image row before reading and creating an absent annotation', async () => {
    const { repo, builder, db } = setup();
    await repo.upsert(data, null);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(builder.from.mock.calls.map(([table]) => table)).toEqual([
      uploadImages,
      imageAnnotations,
    ]);
    expect(builder.for).toHaveBeenCalledWith('update');
    expect(builder.insert).toHaveBeenCalledWith(imageAnnotations);
  });

  it('rejects creation when another session already saved an annotation', async () => {
    const { repo, builder } = setup({ updatedAt: stamp });
    await expect(repo.upsert(data, null)).rejects.toThrow(ConflictException);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it('rejects a stale version or a deleted annotation without writing', async () => {
    const stale = setup({ updatedAt: stamp });
    await expect(stale.repo.upsert(data, new Date(stamp.getTime() - 1))).rejects.toThrow(
      ConflictException,
    );
    expect(stale.builder.insert).not.toHaveBeenCalled();
    const deleted = setup();
    await expect(deleted.repo.upsert(data, stamp)).rejects.toThrow(ConflictException);
    expect(deleted.builder.insert).not.toHaveBeenCalled();
  });

  it('accepts the loaded version and advances the timestamp monotonically', async () => {
    const future = new Date(Date.now() + 100_000);
    const { repo, builder } = setup({ updatedAt: future });
    await repo.upsert(data, future);
    expect(builder.values).toHaveBeenCalledWith({
      ...data,
      updatedAt: new Date(future.getTime() + 1),
    });
  });

  it('preserves unversioned saves for existing clients', async () => {
    const { repo, builder } = setup({ updatedAt: stamp });
    await repo.upsert(data);
    expect(builder.insert).toHaveBeenCalledTimes(1);
  });
});
