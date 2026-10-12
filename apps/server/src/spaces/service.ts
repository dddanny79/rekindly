import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { Space, SpaceColor } from '@app/shared';
import type { Db } from '../db/client';
import { entries, organizations, people, spaces } from '../db/schema';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';

type SpaceRow = typeof spaces.$inferSelect;

const toSpace = (row: SpaceRow, peopleCount: number): Space => ({
  id: row.id,
  name: row.name,
  nameKey: row.nameKey,
  color: (row.color as SpaceColor | null) ?? null,
  sort: row.sort,
  peopleCount,
});

export function listSpaces(db: Db): Space[] {
  const counts = new Map(
    db
      .select({ spaceId: people.spaceId, n: count() })
      .from(people)
      // Indirect contacts are not counted.
      .where(and(notDeleted(people), isNull(people.archivedAt), eq(people.listed, true)))
      .groupBy(people.spaceId)
      .all()
      .map((row) => [row.spaceId, row.n]),
  );
  return db
    .select()
    .from(spaces)
    .where(notDeleted(spaces))
    .orderBy(asc(spaces.sort), asc(spaces.createdAt))
    .all()
    .map((row) => toSpace(row, counts.get(row.id) ?? 0));
}

export function getLiveSpace(db: Db, id: string): SpaceRow {
  const row = db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, id), notDeleted(spaces)))
    .get();
  if (!row) throw new DomainError(400, 'unknown_space');
  return row;
}

export function createSpace(db: Db, input: { name: string; color?: SpaceColor }): Space {
  const sort = db.select({ n: count() }).from(spaces).get()!.n;
  const row = db
    .insert(spaces)
    .values({ name: input.name, color: input.color ?? 'slate', sort })
    .returning()
    .get();
  return toSpace(row, 0);
}

export function updateSpace(
  db: Db,
  id: string,
  input: { name?: string; color?: SpaceColor; sort?: number },
): Space {
  // Renaming a seeded space replaces its translated name.
  const row = db
    .update(spaces)
    .set({ ...input, ...(input.name ? { nameKey: null } : {}) })
    .where(and(eq(spaces.id, id), notDeleted(spaces)))
    .returning()
    .get();
  if (!row) throw notFound();
  return listSpaces(db).find((space) => space.id === row.id)!;
}

/** Only empty spaces can be deleted, and never the last one. */
export function deleteSpace(db: Db, id: string) {
  const live = listSpaces(db);
  if (!live.some((space) => space.id === id)) throw notFound();
  if (live.length === 1) throw new DomainError(409, 'last_space');
  const used = [people, organizations, entries].some(
    (table) =>
      db
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.spaceId, id), notDeleted(table)))
        .get()!.n > 0,
  );
  if (used) throw new DomainError(409, 'space_not_empty');
  db.update(spaces).set({ deletedAt: nowIso() }).where(eq(spaces.id, id)).run();
}
