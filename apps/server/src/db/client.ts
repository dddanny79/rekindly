import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { foldText } from '@app/shared';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

/** Opens (and creates) the SQLite database in `dataDir`. */
export function createDb(dataDir: string) {
  mkdirSync(join(dataDir, 'files'), { recursive: true });
  const sqlite = new Database(join(dataDir, 'app.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  // fold(text): umlaut/accent-insensitive matching (Müller = Mueller = Muller).
  sqlite.function('fold', { deterministic: true }, (value: unknown) =>
    value == null ? null : foldText(String(value)),
  );
  const db = drizzle({ client: sqlite, schema, casing: 'snake_case' });
  return { db, sqlite };
}

/** Applies pending migrations. Safe to run on every start. */
export function runMigrations(db: Db, migrationsDir: string) {
  migrate(db, { migrationsFolder: migrationsDir });
}
