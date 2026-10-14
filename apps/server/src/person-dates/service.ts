import { and, eq } from 'drizzle-orm';
import type { PersonDate, PersonDateKind } from '@app/shared';
import type { Db } from '../db/client';
import { personDates } from '../db/schema';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { getLivePerson, touchPerson } from '../people/refs';

type Row = typeof personDates.$inferSelect;

export const toPersonDate = (row: Row): PersonDate => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  date: row.date,
  remind: row.remind,
});

/** Calendar order (month and day), then oldest first. */
export const byCalendar = (a: { date: string; createdAt: string }, b: typeof a) =>
  a.date.slice(-5).localeCompare(b.date.slice(-5)) || a.createdAt.localeCompare(b.createdAt);

/** Live recurring days of a person, in calendar order. */
export function listPersonDates(db: Db, personId: string): PersonDate[] {
  return db
    .select()
    .from(personDates)
    .where(and(eq(personDates.personId, personId), notDeleted(personDates)))
    .all()
    .sort(byCalendar)
    .map(toPersonDate);
}

export interface PersonDateInput {
  kind: PersonDateKind;
  label?: string | null;
  date: string;
  remind?: boolean;
}

/** Only custom days have an own label; the others are named by their kind. */
const ownLabel = (day: { kind: PersonDateKind; label?: string | null }) =>
  day.kind === 'custom' ? (day.label ?? null) : null;

export function addPersonDate(db: Db, personId: string, input: PersonDateInput): PersonDate {
  getLivePerson(db, personId);
  const row = db
    .insert(personDates)
    .values({
      personId,
      kind: input.kind,
      label: ownLabel(input),
      date: input.date,
      remind: input.remind ?? true,
    })
    .returning()
    .get();
  touchPerson(db, personId);
  return toPersonDate(row);
}

const dateOf = (personId: string, id: string) =>
  and(eq(personDates.id, id), eq(personDates.personId, personId), notDeleted(personDates));

export function updatePersonDate(
  db: Db,
  personId: string,
  id: string,
  input: Partial<PersonDateInput>,
): PersonDate {
  const current = db.select().from(personDates).where(dateOf(personId, id)).get();
  if (!current) throw notFound();
  const next = {
    kind: input.kind ?? current.kind,
    label: input.label === undefined ? current.label : input.label,
    date: input.date ?? current.date,
    remind: input.remind ?? current.remind,
  };
  if (next.kind === 'custom' && !next.label) throw new DomainError(400, 'validation_failed');
  const row = db
    .update(personDates)
    .set({ ...next, label: ownLabel(next), updatedAt: nowIso() })
    .where(eq(personDates.id, id))
    .returning()
    .get();
  touchPerson(db, personId);
  return toPersonDate(row);
}

/** Moves a day to the trash (30 days). */
export function deletePersonDate(db: Db, personId: string, id: string) {
  const res = db.update(personDates).set({ deletedAt: nowIso() }).where(dateOf(personId, id)).run();
  if (res.changes === 0) throw notFound();
  touchPerson(db, personId);
}
