import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { spaces } from './core';
import { id, timestamp, timestamps } from './common';

/** One import of contacts from a file (vCard, CSV, …); undoable as a whole. */
export const contactImports = sqliteTable(
  'contact_imports',
  {
    id: id(),
    format: text('format', { enum: ['vcard', 'csv', 'monica'] }).notNull(),
    fileName: text('file_name'),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id),
    createdCount: integer('created_count').notNull().default(0),
    mergedCount: integer('merged_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    createdAt: timestamps.createdAt,
    undoneAt: timestamp('undone_at'),
  },
  (t) => [check('contact_imports_format_check', sql`${t.format} in ('vcard', 'csv', 'monica')`)],
);

/**
 * A row an import created (or, with `fields`, the person fields it filled in on an
 * existing person). Undo moves exactly these rows to the trash.
 */
export const contactImportItems = sqliteTable(
  'contact_import_items',
  {
    importId: text('import_id')
      .notNull()
      .references(() => contactImports.id, { onDelete: 'cascade' }),
    tableName: text('table_name').notNull(),
    /** Row id; for link tables `<a>:<b>`. */
    rowId: text('row_id').notNull(),
    /** Fields the import set on an existing row (only filled where they were empty). */
    fields: text('fields', { mode: 'json' }).$type<Record<string, string> | null>(),
  },
  (t) => [
    primaryKey({ columns: [t.importId, t.tableName, t.rowId] }),
    index('contact_import_items_row_idx').on(t.tableName, t.rowId),
  ],
);
