import { and, eq, inArray } from 'drizzle-orm';
import { personDisplayName, personInitials, type PersonRef } from '@app/shared';
import type { Db } from '../db/client';
import { people } from '../db/schema';
import { fileUrl } from '../files/service';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';

export type PersonRow = typeof people.$inferSelect;

export const toPersonRef = (row: PersonRow): PersonRef => ({
  id: row.id,
  displayName: personDisplayName(row),
  initials: personInitials(row),
  spaceId: row.spaceId,
  photoUrl: fileUrl(row.photoFileId),
});

export function getLivePerson(db: Db, id: string): PersonRow {
  const row = db
    .select()
    .from(people)
    .where(and(eq(people.id, id), notDeleted(people)))
    .get();
  if (!row) throw notFound();
  return row;
}

export function livePeopleByIds(db: Db, ids: string[]): Map<string, PersonRow> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select()
    .from(people)
    .where(and(inArray(people.id, ids), notDeleted(people)))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

/** Marks the person as changed (list sort “recently changed”, CardDAV etags later). */
export function touchPerson(db: Db, id: string) {
  db.update(people).set({ updatedAt: nowIso() }).where(eq(people.id, id)).run();
}
