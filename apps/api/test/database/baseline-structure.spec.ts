import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guards the reset Drizzle baseline (see drizzle/BASELINE.md).
 * - `0000_baseline.sql` is present and carries the citext extension setup
 *   (drizzle-kit generate omits it; the schema needs it for users.email).
 * - Every journal entry resolves to a migration file (no dangling history).
 * - `drizzle-kit check` confirms snapshots match src/database/schema.ts.
 */
describe('drizzle baseline structure', () => {
  const drizzleDir = resolve(__dirname, '../../drizzle');

  it('keeps 0000_baseline as the only migration with citext setup', () => {
    const baseline = join(drizzleDir, '0000_baseline.sql');
    expect(existsSync(baseline)).toBe(true);
    const head = readFileSync(baseline, 'utf8').split('\n').slice(0, 2).join('\n');
    expect(head).toContain('CREATE EXTENSION IF NOT EXISTS citext;');
  });

  it('has a consistent journal (every entry maps to a file)', () => {
    const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual(['0000_baseline']);
    for (const entry of journal.entries) {
      expect(existsSync(join(drizzleDir, `${entry.tag}.sql`))).toBe(true);
    }
    const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles).toEqual(['0000_baseline.sql']);
    const snapshots = readdirSync(join(drizzleDir, 'meta')).filter((f) =>
      f.endsWith('_snapshot.json'),
    );
    expect(snapshots).toEqual(['0000_snapshot.json']);
  });

  it('passes drizzle-kit check against src/database/schema.ts', () => {
    const output = execFileSync(
      'pnpm',
      ['exec', 'drizzle-kit', 'check', '--config=./drizzle.config.ts'],
      {
        encoding: 'utf8',
        cwd: resolve(__dirname, '../..'),
      },
    );
    expect(output).toContain("Everything's fine");
  });
});
