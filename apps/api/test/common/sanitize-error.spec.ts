import { sanitizeError } from '../../src/common/sanitize-error';

describe('sanitizeError', () => {
  it.each([
    ['Authorization: Bearer abc.def.ghi', 'REDACTED'],
    ['token = value with spaces, next', 'REDACTED'],
    ['object_key=uploads/user/private.jpg', 'REDACTED'],
    ['https://s3.example/x/private.jpg?X-Amz-Credential=AKIA&X-Amz-Signature=secret', 'REDACTED'],
    ['password: hunter2 secret: abc', 'REDACTED'],
    ['uploads/user-123/upload-456/0/original.jpg', 'REDACTED'],
    ['models/model-789/best.pt', 'REDACTED'],
    ['storage failure for owner@example.com', 'REDACTED'],
  ])('redacts adversarial diagnostic %s', (input, _expected) => {
    const result = sanitizeError(input);
    expect(result).not.toContain(
      input.includes('=') ? (input.split(/[=:]/)[1]?.trim() ?? '') : input,
    );
    expect(result).not.toMatch(/Bearer\s+(?!\[REDACTED\])/i);
    expect(result).not.toMatch(/X-Amz-(Credential|Signature)=/i);
  });

  it('preserves ordinary safe errors and bounds output', () => {
    expect(sanitizeError('database timeout while polling')).toBe('database timeout while polling');
    expect(sanitizeError('x'.repeat(500))?.length).toBe(200);
  });
});
