# Drizzle Migrations Baseline

The 18 historical migrations (`0000_whole_zzzax` → `0017_normalize_upload_catalog_relations`)
were squashed into a single `0000_baseline.sql` (rewrite decision: production can reset).

## How it was produced

1. `drizzle-kit generate` from `src/database/schema.ts` into an empty directory.
2. Renamed to `0000_baseline.sql` (+ journal tag) for clarity.
3. Prepended `CREATE EXTENSION IF NOT EXISTS citext;` — `drizzle-kit generate`
   does not emit extension setup, but `users.email` is `citext`. The old `0000`
   carried the same statement; without it a fresh migrate fails.

## Equivalence proof (2026-09-22)

- Migrated the old 18-file chain into fresh DB `agrolens_sq_old` → 17 tables.
- Migrated `0000_baseline.sql` into fresh DB `agrolens_sq_new` → 17 tables.
- `pg_dump --schema-only` structural comparison (per-table column name+type sets,
  constraints, indexes): **equivalent**. The only difference is physical column
  order (later `ADD COLUMN`s appended at the end in the old chain vs. declaration
  order in the baseline) — irrelevant, Drizzle maps columns by name and no code
  depends on ordinal position.

## Going forward

- New schema changes: edit `src/database/schema.ts`, run `pnpm db:generate`,
  inspect, apply. They land as `0001_*`, `0002_*`, … on top of this baseline.
- `test/database/baseline-structure.spec.ts` guards the baseline (single `0000`
  entry, journal consistency, `drizzle-kit check` against `schema.ts`).
- Databases migrated with the old 18-file chain must be reset (or have their
  `drizzle.__drizzle_migrations` journal reconciled) — hashes changed.
