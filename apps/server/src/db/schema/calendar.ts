import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, timestamp, timestamps } from './common';

/** Read-only calendar subscriptions (ICS) behind a secret link. */
export const calendarFeeds = sqliteTable(
  'calendar_feeds',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** SHA-256 of the secret in the link; the link is shown once. */
    tokenHash: text('token_hash').notNull(),
    /** JSON array of space ids; null = all spaces. */
    spaceIds: text('space_ids', { mode: 'json' }).$type<string[] | null>(),
    includeBirthdays: bool('include_birthdays').notNull().default(false),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('calendar_feeds_token_unique').on(t.tokenHash)],
);
