import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { deletedAt, id, timestamps } from './common';

/** Themes created or imported on this instance; the built-in ones live in code. */
export const themes = sqliteTable('themes', {
  id: id(),
  /** The theme in its file format (validated JSON, see docs/themes.md). */
  data: text('data', { mode: 'json' }).notNull(),
  ...timestamps,
  deletedAt: deletedAt(),
});
