import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { bool, timestamp, timestamps } from './common';

/** The single account of this instance (exactly one row, id = 1). */
export const account = sqliteTable(
  'account',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    locale: text('locale').notNull().default('en'),
    ...timestamps,
  },
  (t) => [check('account_single_row_check', sql`${t.id} = 1`)],
);

/** WebAuthn credentials (passkeys). */
export const passkeys = sqliteTable('passkeys', {
  /** Credential id, base64url. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
  counter: integer('counter').notNull().default(0),
  /** JSON array of authenticator transports. */
  transports: text('transports', { mode: 'json' }).$type<string[]>(),
  deviceType: text('device_type'),
  backedUp: bool('backed_up').notNull().default(false),
  lastUsedAt: timestamp('last_used_at'),
  ...timestamps,
});

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself is only in the cookie. */
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt)],
);

/** Browsers that may skip the emailed sign-in code for a while (“trust this device”). */
export const trustedDevices = sqliteTable(
  'trusted_devices',
  {
    id: text('id').primaryKey(),
    /** SHA-256 of the cookie token. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [uniqueIndex('trusted_devices_token_unique').on(t.tokenHash)],
);
