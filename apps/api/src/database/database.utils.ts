import { DrizzleQueryError } from 'drizzle-orm';

export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}

/**
 * Transforms an object's snake_case keys into camelCase keys.
 */
export function toCamelCase(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      value,
    ]),
  );
}

/**
 * Create an Error whose `name` doubles as a machine-readable error code, so
 * services can branch on `error.name` (instead of string-matching messages)
 * and translate it into an appropriate HTTP status.
 */
export function namedError(name: string, message?: string): Error {
  const error = new Error(message ?? name);
  error.name = name;
  return error;
}

/**
 * Derives the unique set of storage object keys for an upload given its file rows.
 */
export function deriveUploadObjectKeys(
  userId: string,
  uploadId: string,
  files: Array<{ objectKey?: string | null; variant?: string | null; imageIndex: number }>,
): Set<string> {
  const keys = new Set<string>();
  for (const file of files) {
    if (file.objectKey) keys.add(file.objectKey);
    if (file.variant === 'original') {
      if (file.objectKey) {
        const finalKey = file.objectKey.replace(/^staging\//, '');
        keys.add(finalKey);
        keys.add(`staging/${finalKey}`);
      }
      keys.add(`uploads/${userId}/${uploadId}/${file.imageIndex}/preview.jpg`);
    }
  }
  return keys;
}
