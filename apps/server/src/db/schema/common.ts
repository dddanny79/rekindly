import { sql } from 'drizzle-orm';
import { integer, text } from 'drizzle-orm/sqlite-core';

/** Text primary key; ids are random UUIDs generated in the application. */
export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** ISO 8601 timestamp in UTC, stored as text. */
export const timestamp = (name: string) => text(name);

export const timestamps = {
  createdAt: timestamp('created_at').notNull().default(nowIso),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(nowIso)
    .$onUpdateFn(() => new Date().toISOString()),
};

/** Soft delete: rows with deleted_at set are in the trash (30 days). */
export const deletedAt = () => timestamp('deleted_at');

export const bool = (name: string) => integer(name, { mode: 'boolean' });
