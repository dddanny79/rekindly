import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, timestamp, timestamps } from './common';

/**
 * Passwords for CardDAV clients (iPhone, DAVx5 …), separate from the login
 * password. Each one sees one address book with the chosen spaces.
 */
export const appPasswords = sqliteTable(
  'app_passwords',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** SHA-256 of the generated password (high entropy, so no slow hash needed). */
    tokenHash: text('token_hash').notNull(),
    /** JSON array of space ids; null = all spaces. */
    spaceIds: text('space_ids', { mode: 'json' }).$type<string[] | null>(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('app_passwords_token_unique').on(t.tokenHash)],
);

/**
 * The vCard of every person as CardDAV serves it, rebuilt with the search index
 * (same change queue). `seq` grows with every change and is the sync token;
 * people who left the address book stay as tombstones (`deleted`) so that
 * `sync-collection` can report them. Photo and deep link are added when serving.
 */
export const davCards = sqliteTable(
  'dav_cards',
  {
    personId: text('person_id').primaryKey(),
    /** Resource name in the address book (`<name>.vcf`); a client's own for its new cards. */
    name: text('name').notNull(),
    /** vCard UID; the client's for cards it created, else the person id. */
    uid: text('uid').notNull(),
    spaceId: text('space_id').notNull(),
    etag: text('etag').notNull(),
    vcard: text('vcard').notNull(),
    photoFileId: text('photo_file_id'),
    seq: integer('seq').notNull(),
    deleted: bool('deleted').notNull().default(false),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index('dav_cards_seq_idx').on(t.seq), uniqueIndex('dav_cards_name_unique').on(t.name)],
);

/** vCard lines from clients that the app has no field for; written back unchanged. */
export const davExtras = sqliteTable('dav_extras', {
  personId: text('person_id').primaryKey(),
  /** Unfolded vCard lines, newline-separated. */
  lines: text('lines').notNull(),
  updatedAt: timestamps.updatedAt,
});
