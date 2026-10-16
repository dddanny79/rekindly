import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, migrationsBefore, migrationsWithExtra } from '../test/migrations';
import { createDb, MigrationError, runMigrations, UPDATE_BACKUPS_KEPT } from './client';

let dir: string;
let backupDir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  backupDir = join(dir, 'backups');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Invented data in (almost) every table, as an instance on 0.1.0 (migrations 0000–0014) has it. */
const FILLED_0_1 = `
  insert into account (id, name, email, password_hash, locale) values (1, 'Erika Musterfrau', 'erika@example.com', 'x', 'de');
  insert into spaces (id, name_key, sort) values ('sp1', 'seed.spaces.private', 0), ('sp2', 'seed.spaces.business', 1);
  insert into files (id, path, mime, size, sha256) values ('f1', 'files/f1.jpg', 'image/jpeg', 10, 'abc');
  insert into organizations (id, space_id, name) values ('o1', 'sp2', 'Northwind Traders'), ('o2', 'sp2', 'Northwind Labs');
  update organizations set parent_id = 'o1' where id = 'o2';
  insert into people (id, space_id, first_name, last_name, birthday, photo_file_id) values
    ('p1', 'sp1', 'Jana', 'Berger', '--03-14', 'f1'),
    ('p2', 'sp1', 'Tom', 'Becker', '1985-07-02', null),
    ('p3', 'sp2', 'Lena', 'Vogel', null, null);
  update people set met_through_person_id = 'p1' where id = 'p2';
  insert into affiliations (id, person_id, organization_id, role) values ('a1', 'p3', 'o1', 'Buyer');
  insert into addresses (id, person_id, city) values ('ad1', 'p1', 'Musterstadt');
  insert into addresses (id, organization_id, city) values ('ad2', 'o1', 'Beispielhausen');
  insert into contact_points (id, person_id, kind, value) values ('c1', 'p1', 'email', 'jana@example.com'), ('c2', 'p2', 'phone', '+49 30 1234567');
  insert into facts (id, person_id, text) values ('fa1', 'p1', 'Runs marathons'), ('fa2', 'p2', 'Allergic to nuts');
  insert into entries (id, space_id, kind, occurred_at, body_md, organization_id) values
    ('e1', 'sp1', 'call', '2026-01-02T10:00:00.000Z', 'Talked about the trip', null),
    ('e2', 'sp2', 'meeting', '2026-02-03T10:00:00.000Z', 'Quarterly review', 'o1');
  insert into entry_people (entry_id, person_id) values ('e1', 'p1'), ('e1', 'p2'), ('e2', 'p3');
  insert into relationship_types (id, name_key, reverse_name_key, symmetric) values ('rt1', 'seed.relationshipTypes.friend', 'seed.relationshipTypes.friend', 1);
  insert into relationships (id, from_person_id, to_person_id, type_id) values ('r1', 'p1', 'p2', 'rt1');
  insert into reminders (id, person_id, entry_id, title, due_at) values ('re1', 'p1', 'e1', 'Call back', '2026-03-01T09:00:00.000Z');
  insert into tags (id, name) values ('t1', 'Climbing');
  insert into person_tags (person_id, tag_id) values ('p1', 't1'), ('p2', 't1');
  insert into person_views (person_id, viewed_at) values ('p1', '2026-01-05T08:00:00.000Z');
  insert into field_definitions (id, target, key, label, type) values ('fd1', 'person', 'shoe', 'Shoe size', 'number');
  insert into field_values (definition_id, target_id, value) values ('fd1', 'p1', '39');
  insert into duplicate_dismissals (person_a_id, person_b_id) values ('p1', 'p2');
  insert into sync_states (id, person_id, uid, etag, href) values ('s1', 'p1', 'uid-1', 'etag-1', '/x/1.vcf');
  insert into dav_cards (person_id, name, uid, space_id, etag, vcard, seq) values ('p1', 'p1.vcf', 'uid-1', 'sp1', 'e', 'BEGIN:VCARD', 1);
  insert into dav_extras (person_id, lines) values ('p1', '[]');
  insert into contact_imports (id, format, space_id) values ('ci1', 'vcard', 'sp1');
  insert into contact_import_items (import_id, table_name, row_id) values ('ci1', 'people', 'p2');
  insert into settings (key, value) values ('ai', '{}');
  insert into sessions (id, expires_at, last_seen_at) values ('se1', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  insert into passkeys (id, name, public_key) values ('pk1', 'Phone', x'00');
  insert into app_passwords (id, name, token_hash) values ('ap1', 'iPhone', 'h');
  insert into calendar_feeds (id, name, token_hash, include_birthdays) values ('cf1', 'Birthdays', 'h', 1);
  insert into api_tokens (id, name, token_hash, scope) values ('at1', 'Claude', 'h', 'read');
`;

/** Rows added by later versions (0.2, 0.3). */
const FILLED_0_3 = `
  insert into trusted_devices (id, token_hash, expires_at) values ('td1', 'h', '2099-01-01T00:00:00.000Z');
  insert into themes (id, data) values ('th1', '{}');
  insert into questions (id, person_id, text) values ('q1', 'p1', 'How was the marathon?');
  insert into person_dates (id, person_id, kind, date) values ('d1', 'p2', 'anniversary', '--06-01');
`;

/** Row count of every table except the search index internals. */
function counts(sqlite: Database.Database) {
  const tables = sqlite
    .prepare(
      `select name from sqlite_master where type = 'table'
       and name not like 'sqlite_%' and name not like 'search_index%' and name != '__drizzle_migrations'
       order by name`,
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      (sqlite.prepare(`select count(*) as n from "${name}"`).get() as { n: number }).n,
    ]),
  );
}

/** A database on the 0.1.0 schema with data in it. */
function filledOldInstance() {
  const old = createDb(dir);
  runMigrations(old.db, migrationsBefore(join(dir, 'migrations-0.1'), '0015'));
  old.sqlite.exec(FILLED_0_1);
  return old;
}

/** A database on the current schema with data in every table. */
function filledInstance() {
  const old = filledOldInstance();
  old.sqlite.close();
  const current = createDb(dir);
  runMigrations(current.db, MIGRATIONS_DIR);
  current.sqlite.exec(FILLED_0_3);
  return current;
}

/** A table rebuild the way drizzle-kit writes it (e.g. to change a column). */
function rebuildPeople(sqlite: Database.Database) {
  const { sql } = sqlite
    .prepare(`select sql from sqlite_master where type = 'table' and name = 'people'`)
    .get() as { sql: string };
  return [
    'PRAGMA foreign_keys=OFF;',
    `${sql.replace(/^CREATE TABLE [`"]people[`"]/, 'CREATE TABLE `__new_people`').replaceAll('"people".', '"__new_people".')};`,
    'INSERT INTO `__new_people` SELECT * FROM `people`;',
    'DROP TABLE `people`;',
    'ALTER TABLE `__new_people` RENAME TO `people`;',
    'PRAGMA foreign_keys=ON;',
  ].join('--> statement-breakpoint\n');
}

const backups = () => (existsSync(backupDir) ? readdirSync(backupDir).sort() : []);

describe('migrations on a filled database', () => {
  it('an update from 0.1.0 keeps every row', () => {
    const old = filledOldInstance();
    const before = counts(old.sqlite);
    old.sqlite.close();

    const { db, sqlite } = createDb(dir);
    const result = runMigrations(db, MIGRATIONS_DIR, { backupDir });
    expect(result.applied).toBeGreaterThan(0);
    const after = counts(sqlite);
    expect(Object.fromEntries(Object.keys(before).map((t) => [t, after[t]]))).toEqual(before);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });

  it('a table rebuild in a future update does not cascade into child rows', () => {
    const filled = filledInstance();
    const before = counts(filled.sqlite);
    const future = migrationsWithExtra(
      join(dir, 'future'),
      '9000_rebuild_people',
      rebuildPeople(filled.sqlite),
    );
    filled.sqlite.close();

    const { db, sqlite } = createDb(dir);
    expect(runMigrations(db, future, { backupDir }).applied).toBe(1);
    expect(counts(sqlite)).toEqual(before);
    expect(sqlite.prepare(`select photo_file_id from people where id = 'p1'`).get()).toEqual({
      photo_file_id: 'f1',
    });
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });

  it('stops with a readable message when an update leaves broken references', () => {
    const filled = filledInstance();
    filled.sqlite.close();
    const future = migrationsWithExtra(
      join(dir, 'broken'),
      '9000_broken',
      `DELETE FROM \`entries\` WHERE id = 'e1';`,
    );

    const { db, sqlite } = createDb(dir);
    let error: unknown;
    try {
      runMigrations(db, future, { backupDir });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MigrationError);
    const message = (error as Error).message;
    expect(message).toMatch(/entry_people/);
    expect(message).toContain(join(backupDir, backups()[0]!));
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });
});

describe('copy before an update', () => {
  it('copies a filled database before pending migrations run', () => {
    filledOldInstance().sqlite.close();

    const { db, sqlite } = createDb(dir);
    const { backup } = runMigrations(db, MIGRATIONS_DIR, { backupDir });
    sqlite.close();
    expect(backup).not.toBeNull();
    expect(backups()).toEqual([backup!.slice(backupDir.length + 1)]);
    expect(backups()[0]).toMatch(/^pre-update-\d{8}-\d{9}-.+\.sqlite$/);

    // The copy is the database as it was: old schema, same data.
    const copy = new Database(backup!, { readonly: true });
    expect(copy.prepare('select count(*) as n from people').get()).toEqual({ n: 3 });
    expect(copy.prepare('select count(*) as n from __drizzle_migrations').get()).toEqual({ n: 15 });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();
  });

  it('writes no copy for a new database or when nothing is pending', () => {
    const fresh = createDb(dir);
    expect(runMigrations(fresh.db, MIGRATIONS_DIR, { backupDir }).backup).toBeNull();
    fresh.sqlite.close();

    const again = createDb(dir);
    expect(runMigrations(again.db, MIGRATIONS_DIR, { backupDir })).toEqual({
      applied: 0,
      backup: null,
    });
    again.sqlite.close();
    expect(backups()).toEqual([]);
  });

  it(`keeps the newest ${UPDATE_BACKUPS_KEPT} copies and leaves other files alone`, () => {
    filledOldInstance().sqlite.close();
    mkdirSync(backupDir, { recursive: true });
    const older = [
      'pre-update-20260101-000000000-0.2.0.sqlite',
      'pre-update-20260201-000000000-0.3.0.sqlite',
      'pre-update-20260301-000000000-0.3.0.sqlite',
    ];
    for (const name of [...older, 'app-20260101-000000.sqlite', 'notes.txt']) {
      writeFileSync(join(backupDir, name), 'x');
    }

    const { db, sqlite } = createDb(dir);
    const { backup } = runMigrations(db, MIGRATIONS_DIR, { backupDir });
    sqlite.close();
    expect(backups()).toEqual(
      [
        'app-20260101-000000.sqlite',
        'notes.txt',
        older[1],
        older[2],
        backup!.slice(backupDir.length + 1),
      ].sort(),
    );
  });

  it('changes nothing when the copy cannot be written', () => {
    filledOldInstance().sqlite.close();
    writeFileSync(backupDir, 'not a directory');

    const { db, sqlite } = createDb(dir);
    expect(() => runMigrations(db, MIGRATIONS_DIR, { backupDir })).toThrow(MigrationError);
    expect(sqlite.prepare('select count(*) as n from __drizzle_migrations').get()).toEqual({
      n: 15,
    });
    sqlite.close();
  });
});
