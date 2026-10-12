import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { people } from './core';

/**
 * One searchable document per person and organization. `id` is also the rowid of the
 * matching row in the FTS5 table `search_index` (created in a custom migration), which
 * holds the folded text. `fields` keeps the original texts to show where a hit matched.
 */
export const searchDocuments = sqliteTable(
  'search_documents',
  {
    id: integer('id').primaryKey(),
    entityType: text('entity_type', { enum: ['person', 'organization'] }).notNull(),
    entityId: text('entity_id').notNull(),
    spaceId: text('space_id').notNull(),
    /** Indirect contacts rank after contacts. */
    listed: integer('listed', { mode: 'boolean' }).notNull().default(true),
    /** JSON array of the indexed fields (see `search/document.ts`). */
    fields: text('fields').notNull(),
  },
  (t) => [
    uniqueIndex('search_documents_entity_unique').on(t.entityType, t.entityId),
    index('search_documents_space_idx').on(t.spaceId),
  ],
);

/**
 * Entities whose search document is out of date. Filled by triggers on every table
 * that feeds the index, drained by the search service.
 */
export const searchQueue = sqliteTable(
  'search_queue',
  {
    /** person, organization, organization_tree, tag or field_definition. */
    kind: text('kind').notNull(),
    entityId: text('entity_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.entityId] })],
);

/** When a person page was last opened (“Recently viewed” on the Today page). */
export const personViews = sqliteTable(
  'person_views',
  {
    personId: text('person_id')
      .primaryKey()
      .references(() => people.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at').notNull(),
  },
  (t) => [index('person_views_viewed_idx').on(t.viewedAt)],
);
