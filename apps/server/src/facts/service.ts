import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Fact } from '@app/shared';
import type { Db } from '../db/client';
import { facts } from '../db/schema';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { getLivePerson, touchPerson } from '../people/refs';

const toFact = (row: typeof facts.$inferSelect): Fact => ({
  id: row.id,
  text: row.text,
  pinned: row.pinned,
  sort: row.sort,
});

export function listFacts(db: Db, personId: string): Fact[] {
  return db
    .select()
    .from(facts)
    .where(and(eq(facts.personId, personId), notDeleted(facts)))
    .orderBy(asc(facts.sort), asc(facts.createdAt))
    .all()
    .map(toFact);
}

export function addFact(db: Db, personId: string, input: { text: string; pinned?: boolean }): Fact {
  getLivePerson(db, personId);
  const sort = listFacts(db, personId).reduce((max, f) => Math.max(max, f.sort + 1), 0);
  const row = db
    .insert(facts)
    .values({ personId, text: input.text, pinned: input.pinned ?? false, sort })
    .returning()
    .get();
  touchPerson(db, personId);
  return toFact(row);
}

const factOf = (personId: string, id: string) =>
  and(eq(facts.id, id), eq(facts.personId, personId), notDeleted(facts));

export function updateFact(
  db: Db,
  personId: string,
  id: string,
  input: { text?: string; pinned?: boolean },
) {
  const row = db.update(facts).set(input).where(factOf(personId, id)).returning().get();
  if (!row) throw notFound();
  touchPerson(db, personId);
  return toFact(row);
}

export function deleteFact(db: Db, personId: string, id: string) {
  const res = db.update(facts).set({ deletedAt: nowIso() }).where(factOf(personId, id)).run();
  if (res.changes === 0) throw notFound();
  touchPerson(db, personId);
}

/** Sets the order to `ids`; facts not listed keep their place after them. */
export function reorderFacts(db: Db, personId: string, ids: string[]): Fact[] {
  getLivePerson(db, personId);
  db.transaction((tx) => {
    const own = new Set(
      tx
        .select({ id: facts.id })
        .from(facts)
        .where(and(eq(facts.personId, personId), inArray(facts.id, ids.length ? ids : [''])))
        .all()
        .map((r) => r.id),
    );
    ids
      .filter((id) => own.has(id))
      .forEach((id, index) => tx.update(facts).set({ sort: index }).where(eq(facts.id, id)).run());
  });
  touchPerson(db, personId);
  return listFacts(db, personId);
}
