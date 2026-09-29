# Drizzle Initial Migration

`0000_baseline.sql` is the only migration. It was generated from the current
`src/database/schema.ts` with `drizzle-kit generate --name baseline` into an empty
directory, alongside a new snapshot and journal. It includes image UUIDs and
per-image coordinates from the outset; there is no data backfill.

`CREATE EXTENSION IF NOT EXISTS citext;` was prepended to the generated SQL because
Drizzle does not emit extension setup and `users.email` requires `citext`.

All older migration histories are replaced. Back up anything you need, then use
a **fresh database** before running migrations or starting the API (which migrates
on startup). Do not apply this initial migration to a populated or shared database.

For future schema changes, edit `src/database/schema.ts`, run `pnpm db:generate`,
inspect the output, then migrate the intended database. New migrations start at
`0001_*`. `test/database/baseline-structure.spec.ts` guards the single baseline,
extension setup, and journal consistency.
