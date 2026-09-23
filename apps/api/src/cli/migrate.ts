import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { join } from 'node:path';

const MIGRATION_LOCK = 'agrolens:drizzle:migrations';

export async function runMigrations(databaseUrl = process.env.DATABASE_URL): Promise<void> {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations');

  // Monorepo-safe: allow overriding the migrations folder (compiled dist and
  // tsx runs resolve differently); default preserves the historical layout.
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_DIR || join(__dirname, '../../drizzle');
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  try {
    await db.execute(sql`SELECT pg_advisory_lock(hashtext(${MIGRATION_LOCK}))`);
    await migrate(db, { migrationsFolder });
  } finally {
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(hashtext(${MIGRATION_LOCK}))`);
    } finally {
      await client.end();
    }
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Database migrations applied.'))
    .catch((error: unknown) => {
      console.error('Database migration failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
