import { uploadInitSchema } from '../../../src/uploads/dto/upload-init.dto';
import { uploadListSchema } from '../../../src/uploads/dto/upload-list.dto';
import { timestampSchema } from '../../../src/uploads/dto/timestamp.schema';

describe('timestampSchema', () => {
  it('accepts timezone-qualified timestamps and yields a Date', () => {
    const parsed = timestampSchema.parse('2025-06-15T10:30:00Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe('2025-06-15T10:30:00.000Z');
  });

  it('accepts explicit numeric offsets and fractional seconds', () => {
    expect(timestampSchema.parse('2025-06-15T10:30:00.123-03:00').toISOString()).toBe(
      '2025-06-15T13:30:00.123Z',
    );
    expect(timestampSchema.parse('2025-06-15T10:30:00+00:00')).toBeInstanceOf(Date);
  });

  it.each([
    ['2025-06-15'],
    ['2025-06-15T10:30:00'],
    ['2025-06-15 10:30:00Z'],
    ['not-a-date'],
    [''],
  ])('rejects naive or malformed value %j', (value) => {
    expect(() => timestampSchema.parse(value)).toThrow();
  });

  it('rejects strings that match the shape but are not real dates', () => {
    expect(() => timestampSchema.parse('2025-13-40T10:30:00Z')).toThrow();
  });
});

describe('uploadInitSchema activityDate', () => {
  const base = {
    clientUploadId: 'client-1',
    propertyId: '00000000-0000-0000-0000-000000000001',
    talhaoId: '00000000-0000-0000-0000-000000000002',
    cropTypeId: '00000000-0000-0000-0000-000000000003',
    source: 'phone',
    latitude: -22.9,
    longitude: -43.1,
    files: [{ contentType: 'image/jpeg' }],
  };

  it('accepts a timezone-qualified activityDate as a Date', () => {
    const parsed = uploadInitSchema.parse({ ...base, activityDate: '2025-06-15T10:30:00Z' });
    expect(parsed.activityDate).toBeInstanceOf(Date);
  });

  it('rejects a naive activityDate', () => {
    expect(() => uploadInitSchema.parse({ ...base, activityDate: '2025-06-15' })).toThrow();
    expect(() =>
      uploadInitSchema.parse({ ...base, activityDate: '2025-06-15T10:30:00' }),
    ).toThrow();
  });
});

describe('uploadListSchema date filters', () => {
  it('accepts timezone-qualified date filters as Dates', () => {
    const parsed = uploadListSchema.parse({
      activityFrom: '2025-06-01T00:00:00Z',
      createdTo: '2025-06-30T23:59:59+02:00',
    });
    expect(parsed.activityFrom).toBeInstanceOf(Date);
    expect(parsed.createdTo).toBeInstanceOf(Date);
  });

  it('rejects naive date filters', () => {
    expect(() => uploadListSchema.parse({ activityFrom: '2025-06-01' })).toThrow();
    expect(() => uploadListSchema.parse({ createdFrom: '2025-06-01T00:00' })).toThrow();
  });
});
