import { deriveUploadObjectKeys } from '../../src/database/database.utils';

describe('deriveUploadObjectKeys', () => {
  it.each(['staging/uploads/user/upload/0/original.png', 'uploads/user/upload/0/original.png'])(
    'cleans both sides of finalization when the recorded key is %s',
    (objectKey) => {
      expect(
        deriveUploadObjectKeys('user', 'upload', [
          { objectKey, variant: 'original', imageIndex: 0 },
        ]),
      ).toEqual(
        new Set([
          'staging/uploads/user/upload/0/original.png',
          'uploads/user/upload/0/original.png',
          'uploads/user/upload/0/preview.jpg',
        ]),
      );
    },
  );
});
