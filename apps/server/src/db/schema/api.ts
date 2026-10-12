import { sql } from 'drizzle-orm';
import { check, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp, timestamps } from './common';

/** Tokens for the API and the MCP server (own tools, AI assistants). */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** SHA-256 of the token; the token is shown once. */
    tokenHash: text('token_hash').notNull(),
    scope: text('scope', { enum: ['read', 'write'] }).notNull(),
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('api_tokens_token_unique').on(t.tokenHash),
    check('api_tokens_scope_check', sql`${t.scope} in ('read', 'write')`),
  ],
);
