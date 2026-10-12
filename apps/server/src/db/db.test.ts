import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations } from './client';
import { people, relationshipTypes, spaces } from './schema';
import { seed } from './seed';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'db-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function open() {
  const handle = createDb(dir);
  runMigrations(handle.db, MIGRATIONS_DIR);
  seed(handle.db);
  return handle;
}

describe('database', () => {
  it('uses WAL and enforces foreign keys', () => {
    const { db, sqlite } = open();
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() => db.insert(people).values({ spaceId: 'missing', firstName: 'X' }).run()).toThrow(
      /FOREIGN KEY/,
    );
    sqlite.close();
  });

  it('creates all tables from the data model, including the FTS index', () => {
    const { db, sqlite } = open();
    const names = db
      .all<{ name: string }>(
        sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '%search_index_%' and name not like '__drizzle%'`,
      )
      .map((r) => r.name)
      .sort();
    expect(names).toEqual(
      [
        'account',
        'addresses',
        'app_passwords',
        'calendar_feeds',
        'affiliations',
        'contact_points',
        'dav_cards',
        'dav_extras',
        'entries',
        'entry_people',
        'facts',
        'field_definitions',
        'field_values',
        'files',
        'organizations',
        'passkeys',
        'people',
        'person_tags',
        'person_views',
        'relationship_types',
        'relationships',
        'reminders',
        'search_documents',
        'search_index',
        'search_queue',
        'sessions',
        'settings',
        'spaces',
        'sync_states',
        'tags',
      ].sort(),
    );
    sqlite.close();
  });

  it('migrations and seed are idempotent across restarts', () => {
    open().sqlite.close();
    const { db, sqlite } = open();
    expect(
      db
        .select()
        .from(spaces)
        .all()
        .map((s) => s.nameKey),
    ).toEqual(['seed.spaces.private', 'seed.spaces.business']);
    expect(db.select().from(relationshipTypes).all()).toHaveLength(6);
    sqlite.close();
  });

  it('does not re-seed after the user removed seeded rows', () => {
    const first = open();
    first.db.delete(relationshipTypes).run();
    first.sqlite.close();
    const { db, sqlite } = open();
    expect(db.select().from(relationshipTypes).all()).toHaveLength(0);
    sqlite.close();
  });

  it('validates birthdays (year optional)', () => {
    const { db, sqlite } = open();
    const spaceId = db.select().from(spaces).get()!.id;
    for (const birthday of ['--03-14', '1985-03-14']) {
      expect(() =>
        db.insert(people).values({ spaceId, firstName: 'A', birthday }).run(),
      ).not.toThrow();
    }
    expect(() =>
      db.insert(people).values({ spaceId, firstName: 'B', birthday: '14.03.1985' }).run(),
    ).toThrow(/CHECK/);
    sqlite.close();
  });

  it('folds diacritics in the search index', () => {
    const { db, sqlite } = open();
    db.run(
      sql`insert into search_index (rowid, name, details, notes) values (1, 'Jürgen Müller', '', '')`,
    );
    const hits = db.all(sql`select rowid from search_index where search_index match 'muller'`);
    expect(hits).toHaveLength(1);
    sqlite.close();
  });
});
