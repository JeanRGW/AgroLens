import { toUtcIsoOrNull } from './upload-utils';

describe('toUtcIsoOrNull', () => {
  it('converts a datetime-local value to a timezone-qualified UTC ISO string', () => {
    // new Date("2025-06-01T10:30") is interpreted in the local timezone, so
    // compare through the local Date rather than pinning a wall-clock UTC.
    const local = new Date(2025, 5, 1, 10, 30);
    expect(toUtcIsoOrNull('2025-06-01T10:30')).toBe(local.toISOString());
  });

  it('passes through already-qualified strings unchanged', () => {
    expect(toUtcIsoOrNull('2025-06-01T10:30:00Z')).toBe('2025-06-01T10:30:00.000Z');
  });

  it('returns undefined for empty, null, or invalid input', () => {
    expect(toUtcIsoOrNull('')).toBeUndefined();
    expect(toUtcIsoOrNull('   ')).toBeUndefined();
    expect(toUtcIsoOrNull(null)).toBeUndefined();
    expect(toUtcIsoOrNull(undefined)).toBeUndefined();
    expect(toUtcIsoOrNull('not-a-date')).toBeUndefined();
  });
});
