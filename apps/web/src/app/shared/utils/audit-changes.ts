export type ChangeStatus = 'changed' | 'added' | 'removed' | 'unchanged';

export interface ChangeRow {
  key: string;
  before: unknown;
  after: unknown;
  status: ChangeStatus;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Diff two audit payloads into per-key rows. Before-keys keep their order,
 * keys only present in `after` are appended as additions.
 */
export function diffRecords(
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {},
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      rows.push({ key, before: before[key], after: undefined, status: 'removed' });
    } else if (valuesEqual(before[key], after[key])) {
      rows.push({ key, before: before[key], after: after[key], status: 'unchanged' });
    } else {
      rows.push({ key, before: before[key], after: after[key], status: 'changed' });
    }
  }
  for (const key of Object.keys(after)) {
    if (!(key in before)) {
      rows.push({ key, before: undefined, after: after[key], status: 'added' });
    }
  }
  return rows;
}

export function formatChangeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '–';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * One-line cell summary: `key: before → after` for a single change,
 * `N campos alterados` for several, `–` when there is nothing to show.
 */
export function summarizeChanges(
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): string {
  const changed = diffRecords(before ?? {}, after ?? {}).filter(
    (row) => row.status !== 'unchanged',
  );
  if (changed.length === 0) return '–';
  if (changed.length === 1) {
    const [row] = changed;
    return `${row.key}: ${formatChangeValue(row.before)} → ${formatChangeValue(row.after)}`;
  }
  return `${changed.length} campos alterados`;
}
