import {
  uploadRequestHash as normalizedHash,
  normalizeUploadRequest,
} from '../../src/uploads/uploads.service';
import type { UploadInitDto } from '@agrolens/contracts';

const uploadRequestHash = (dto: UploadInitDto) => normalizedHash(normalizeUploadRequest(dto));

const request: UploadInitDto = {
  clientUploadId: 'client',
  propertyId: 'property',
  talhaoId: 'field',
  cropTypeId: 'crop',
  source: 'phone',
  activityDate: new Date('2026-10-12T12:00:00Z'),
  files: [
    {
      imageId: 'a',
      contentType: 'image/jpeg',
      latitude: null,
      longitude: null,
      locationSource: 'file',
    },
    { imageId: 'b', contentType: 'image/png', latitude: 1, longitude: 2, locationSource: 'manual' },
  ],
};
describe('uploadRequestHash', () => {
  it('normalizes older descriptors and removes provisional file coordinates before storage', () => {
    const normalized = normalizeUploadRequest({
      ...request,
      files: [
        { ...request.files[0], locationSource: undefined },
        { ...request.files[1], locationSource: undefined },
        { ...request.files[0], imageId: 'c', latitude: 3, longitude: 4 },
      ],
    });
    expect(normalized.files.map((file) => file.locationSource)).toEqual(['file', 'device', 'file']);
    expect(normalized.files[2]).toMatchObject({ latitude: null, longitude: null });
  });
  it('ignores order, optional size declarations and provisional file GPS', () => {
    const retry = {
      ...request,
      files: [request.files[1], { ...request.files[0], sizeBytes: 100, latitude: 3, longitude: 4 }],
    };
    expect(uploadRequestHash(retry)).toBe(uploadRequestHash(request));
  });
  it('detects changed user intent and manual coordinates', () => {
    expect(
      uploadRequestHash({
        ...request,
        files: [{ ...request.files[0], locationSource: 'none' }, request.files[1]],
      }),
    ).not.toBe(uploadRequestHash(request));
    expect(
      uploadRequestHash({
        ...request,
        files: [request.files[0], { ...request.files[1], latitude: 3 }],
      }),
    ).not.toBe(uploadRequestHash(request));
  });
  it('normalizes timestamps to their instant', () => {
    expect(
      uploadRequestHash({ ...request, activityDate: new Date('2026-10-12T09:00:00-03:00') }),
    ).toBe(uploadRequestHash(request));
  });
});
