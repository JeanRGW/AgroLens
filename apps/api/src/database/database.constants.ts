import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';
export type DatabaseConnection = PostgresJsDatabase<typeof schema>;
