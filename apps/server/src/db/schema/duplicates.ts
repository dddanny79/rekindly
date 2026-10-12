import { sql } from 'drizzle-orm';
import { check, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { people } from './core';
import { timestamps } from './common';

/** A pair the user marked as “not the same person”; ids sorted (a < b). */
export const duplicateDismissals = sqliteTable(
  'duplicate_dismissals',
  {
    personAId: text('person_a_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    personBId: text('person_b_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.personAId, t.personBId] }),
    index('duplicate_dismissals_b_idx').on(t.personBId),
    check('duplicate_dismissals_order_check', sql`${t.personAId} < ${t.personBId}`),
  ],
);
