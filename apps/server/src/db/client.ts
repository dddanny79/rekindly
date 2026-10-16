import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { foldText } from '@app/shared';
import { APP_VERSION } from '../version';
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

/** DATA_DIR/backups: CLI snapshots and copies from before an update. */
export const backupsDir = (dataDir: string) => join(dataDir, 'backups');

/** How many pre-update copies are kept (the newest ones). */
export const UPDATE_BACKUPS_KEPT = 3;
const UPDATE_BACKUP_FILE = /^pre-update-\d{8}-\d{9}-.+\.sqlite$/;

/** A migration could not run safely; the message is meant for the person running the app. */
export class MigrationError extends Error {}

export interface MigrationResult {
  /** Number of migrations applied. */
  applied: number;
  /** Copy of the database from before the migrations, if one was written. */
  backup: string | null;
}

/**
 * Applies pending migrations. Safe to run on every start.
 *
 * With `backupDir`, a filled database is copied there first (the newest
 * {@link UPDATE_BACKUPS_KEPT} copies are kept). Foreign keys are off while the
 * migrations run, so a table rebuild (drop + recreate) never cascades into
 * the rows that point at it; afterwards every reference is checked.
 */
export function runMigrations(
  db: Db,
  migrationsDir: string,
  options: { backupDir?: string } = {},
): MigrationResult {
  const sqlite = db.$client;
  const applied = lastAppliedMigration(sqlite);
  const pending = readMigrationFiles({ migrationsFolder: migrationsDir }).filter(
    (m) => applied === undefined || applied < m.folderMillis,
  ).length;
  if (pending === 0) return { applied: 0, backup: null };

  // A new, empty database has nothing to lose.
  const backup =
    options.backupDir && applied !== undefined
      ? backupBeforeUpdate(sqlite, options.backupDir)
      : null;

  // The pragma is a no-op inside a transaction, so it is switched around the
  // migrator's own transaction.
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: migrationsDir });
    const broken = sqlite.pragma('foreign_key_check') as { table: string }[];
    if (broken.length > 0) {
      const tables = [...new Set(broken.map((row) => row.table))].sort().join(', ');
      throw new MigrationError(
        `The update left ${broken.length} rows that point to missing rows (${tables}). ` +
          (backup
            ? `The database from before the update is at ${backup}. `
            : 'Restore your latest backup. ') +
          'Please go back to the previous version, restore that copy and report this as a bug.',
      );
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  return { applied: pending, backup };
}

/** `created_at` of the newest applied migration; undefined for a new database. */
function lastAppliedMigration(sqlite: Database.Database): number | undefined {
  const table = sqlite
    .prepare(`select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'`)
    .get();
  if (!table) return undefined;
  const row = sqlite.prepare('select max(created_at) as last from __drizzle_migrations').get() as {
    last: number | string | null;
  };
  return row.last == null ? undefined : Number(row.last);
}

/** Writes a consistent copy of the database and keeps only the newest ones. */
function backupBeforeUpdate(sqlite: Database.Database, dir: string): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18);
  const file = join(dir, `pre-update-${stamp}-${APP_VERSION}.sqlite`);
  try {
    mkdirSync(dir, { recursive: true });
    if (existsSync(file)) rmSync(file);
    // VACUUM INTO is synchronous and includes what is still in the WAL.
    sqlite.prepare('vacuum into ?').run(file);
  } catch (error) {
    throw new MigrationError(
      `Could not save a copy of the database to ${dir} before the update ` +
        `(${(error as Error).message}). Nothing was changed. Check free disk space and ` +
        'that the directory is writable, then start again.',
    );
  }
  const old = readdirSync(dir)
    .filter((name) => UPDATE_BACKUP_FILE.test(name))
    .sort()
    .slice(0, -UPDATE_BACKUPS_KEPT);
  for (const name of old) rmSync(join(dir, name), { force: true });
  return file;
}
