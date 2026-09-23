import { TestBed } from '@angular/core/testing';

import { OfflineUploadStoreService } from './offline-upload-store.service';
import { OfflineUpload } from '../../shared/models/offline-upload';

function buildUpload(overrides: Partial<OfflineUpload> = {}): OfflineUpload {
  return {
    id: 'local-1',
    userId: 'user-1',
    request: {
      clientUploadId: 'client-1',
      propertyId: 'p1',
      talhaoId: 't1',
      cropTypeId: 'c1',
      source: 'phone',
      activityDate: '2025-06-01T12:00:00Z',
      latitude: -15.5,
      longitude: -47.5,
      files: [{ fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 4 }],
    },
    files: [{ blob: new Blob(['data']), fileName: 'a.jpg', contentType: 'image/jpeg' }],
    status: 'pending',
    createdAt: '2025-06-01T12:00:00Z',
    updatedAt: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

describe('OfflineUploadStoreService', () => {
  let service: OfflineUploadStoreService;

  beforeEach(async () => {
    indexedDB.deleteDatabase('agrolens-offline');
    TestBed.configureTestingModule({
      providers: [OfflineUploadStoreService],
    });
    service = TestBed.inject(OfflineUploadStoreService);
  });

  afterEach(() => {
    indexedDB.deleteDatabase('agrolens-offline');
  });

  it('saves, lists, and deletes uploads for a user', async () => {
    const upload = buildUpload();
    await service.save(upload);
    await service.save(buildUpload({ id: 'other', userId: 'user-2' }));

    const listed = await service.list('user-1');
    expect(listed.map((item) => item.id)).toEqual(['local-1']);

    await service.delete('local-1');
    expect(await service.list('user-1')).toEqual([]);
  });

  it('deletes every upload for a user', async () => {
    await service.save(buildUpload({ id: 'a' }));
    await service.save(buildUpload({ id: 'b', createdAt: '2025-06-02T12:00:00Z' }));
    await service.save(buildUpload({ id: 'c', userId: 'user-2' }));

    await service.deleteAll('user-1');

    expect(await service.list('user-1')).toEqual([]);
    expect((await service.list('user-2')).map((item) => item.id)).toEqual(['c']);
  });
});
