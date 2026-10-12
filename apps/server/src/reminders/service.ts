import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Reminder } from '@app/shared';
import type { Db } from '../db/client';
import { people, reminders } from '../db/schema';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { getLivePerson, toPersonRef, touchPerson } from '../people/refs';

export function listReminders(
  db: Db,
  query: { personId?: string; status?: 'open' | 'done' | 'all' },
): Reminder[] {
  const conditions = [notDeleted(reminders)];
  if (query.personId) conditions.push(eq(reminders.personId, query.personId));
  const status = query.status ?? 'open';
  if (status === 'open') conditions.push(isNull(reminders.doneAt));
  if (status === 'done') conditions.push(isNotNull(reminders.doneAt));
  return (
    db
      .select({ reminder: reminders, person: people })
      .from(reminders)
      .leftJoin(people, eq(people.id, reminders.personId))
      .where(and(...conditions))
      .orderBy(asc(reminders.dueAt), asc(reminders.createdAt))
      .all()
      // Follow-ups of trashed people are hidden with them.
      .filter(({ person }) => !person || !person.deletedAt)
      .map(({ reminder, person }) => ({
        id: reminder.id,
        title: reminder.title,
        dueOn: reminder.dueAt.slice(0, 10),
        doneAt: reminder.doneAt,
        entryId: reminder.entryId,
        person: person ? toPersonRef(person) : null,
      }))
  );
}

const getReminder = (db: Db, id: string) =>
  listReminders(db, { status: 'all' }).find((r) => r.id === id);

export function addReminder(
  db: Db,
  personId: string,
  input: { title: string; dueOn: string; entryId?: string },
): Reminder {
  getLivePerson(db, personId);
  const row = db
    .insert(reminders)
    .values({ personId, title: input.title, dueAt: input.dueOn, entryId: input.entryId ?? null })
    .returning()
    .get();
  touchPerson(db, personId);
  return getReminder(db, row.id)!;
}

export function updateReminder(
  db: Db,
  id: string,
  input: { title?: string; dueOn?: string; done?: boolean },
): Reminder {
  const current = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), notDeleted(reminders)))
    .get();
  if (!current) throw notFound();
  db.update(reminders)
    .set({
      ...(input.title ? { title: input.title } : {}),
      ...(input.dueOn ? { dueAt: input.dueOn } : {}),
      ...(input.done === undefined
        ? {}
        : { doneAt: input.done ? (current.doneAt ?? nowIso()) : null }),
    })
    .where(eq(reminders.id, id))
    .run();
  if (current.personId) touchPerson(db, current.personId);
  return getReminder(db, id)!;
}

export function deleteReminder(db: Db, id: string) {
  const row = db
    .update(reminders)
    .set({ deletedAt: nowIso() })
    .where(and(eq(reminders.id, id), notDeleted(reminders)))
    .returning()
    .get();
  if (!row) throw notFound();
  if (row.personId) touchPerson(db, row.personId);
}
