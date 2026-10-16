import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

interface Journal {
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
}

const journalPath = (dir: string) => join(dir, 'meta', '_journal.json');
const readJournal = (dir: string) => JSON.parse(readFileSync(journalPath(dir), 'utf8')) as Journal;

/** Copy of the migrations in `target`, limited to those before `beforeTag` (e.g. '0015'). */
export function migrationsBefore(target: string, beforeTag: string) {
  cpSync(MIGRATIONS_DIR, target, { recursive: true });
  const journal = readJournal(target);
  journal.entries = journal.entries.filter((e) => e.tag < beforeTag);
  writeFileSync(journalPath(target), JSON.stringify(journal));
  return target;
}

/** Copy of all migrations in `target` plus one more, as a future update would bring it. */
export function migrationsWithExtra(target: string, tag: string, sql: string) {
  cpSync(MIGRATIONS_DIR, target, { recursive: true });
  const journal = readJournal(target);
  const last = journal.entries.at(-1)!;
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag });
  writeFileSync(journalPath(target), JSON.stringify(journal));
  writeFileSync(join(target, `${tag}.sql`), sql);
  return target;
}
