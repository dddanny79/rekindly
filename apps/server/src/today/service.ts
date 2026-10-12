import { and, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import {
  CONTACT_KINDS,
  type OverdueContact,
  type RecentPerson,
  TODAY_BIRTHDAY_DAYS,
  TODAY_RECENT_LIMIT,
  type TodayBirthday,
  type TodayResponse,
} from '@app/shared';
import type { Db } from '../db/client';
import { entries, entryPeople, people, personViews } from '../db/schema';
import { notDeleted, nowIso } from '../lib/sql';
import { getLivePerson, toPersonRef } from '../people/refs';
import { personSubtitles } from '../people/service';
import { listReminders } from '../reminders/service';

const DAY = 86_400_000;

/** `YYYY-MM-DD` as a UTC timestamp (calendar arithmetic without time zones). */
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Next occurrence of a birthday on or after `today`. A 29 February is celebrated
 * on 1 March in other years, like the briefing on the person page does.
 */
export function nextBirthday(birthday: string, today: string) {
  const [, month, day] = birthday.replace(/^--/, '0000-').split('-').map(Number);
  const year = Number(today.slice(0, 4));
  let on = Date.UTC(year, month! - 1, day!);
  if (on < utc(today)) on = Date.UTC(year + 1, month! - 1, day!);
  const birthYear = birthday.startsWith('--') ? null : Number(birthday.slice(0, 4));
  return {
    on: toDate(on),
    inDays: Math.round((on - utc(today)) / DAY),
    turns: birthYear ? new Date(on).getUTCFullYear() - birthYear : null,
  };
}

/** Live, not archived people, optionally in one space. */
function activePeople(spaceId: string | undefined) {
  return and(
    notDeleted(people),
    isNull(people.archivedAt),
    spaceId ? eq(people.spaceId, spaceId) : undefined,
  );
}

function birthdays(db: Db, today: string, spaceId?: string): TodayBirthday[] {
  return db
    .select()
    .from(people)
    .where(and(activePeople(spaceId), isNotNull(people.birthday)))
    .all()
    .map((person) => ({ person, next: nextBirthday(person.birthday!, today) }))
    .filter(({ next }) => next.inDays <= TODAY_BIRTHDAY_DAYS)
    .sort(
      (a, b) =>
        a.next.inDays - b.next.inDays ||
        toPersonRef(a.person).displayName.localeCompare(toPersonRef(b.person).displayName),
    )
    .map(({ person, next }) => ({
      person: toPersonRef(person),
      birthday: person.birthday!,
      ...next,
    }));
}

/** People with a contact rhythm whose last call, meeting or message is too long ago. */
function overdueContacts(db: Db, today: string, spaceId?: string): OverdueContact[] {
  const rows = db
    .select()
    .from(people)
    .where(and(activePeople(spaceId), isNotNull(people.contactEveryDays)))
    .all();
  if (!rows.length) return [];
  const last = new Map(
    db
      .select({ personId: entryPeople.personId, at: max(entries.occurredAt) })
      .from(entryPeople)
      .innerJoin(entries, eq(entries.id, entryPeople.entryId))
      .where(
        and(
          inArray(
            entryPeople.personId,
            rows.map((r) => r.id),
          ),
          notDeleted(entries),
          inArray(entries.kind, [...CONTACT_KINDS]),
        ),
      )
      .groupBy(entryPeople.personId)
      .all()
      .map((row) => [row.personId, row.at]),
  );
  return rows
    .flatMap((person): OverdueContact[] => {
      const lastContactAt = last.get(person.id) ?? null;
      const every = person.contactEveryDays!;
      if (!lastContactAt) {
        return [
          {
            person: toPersonRef(person),
            contactEveryDays: every,
            lastContactAt,
            overdueDays: null,
          },
        ];
      }
      const due = utc(lastContactAt.slice(0, 10)) + every * DAY;
      const overdueDays = Math.round((utc(today) - due) / DAY);
      return overdueDays > 0
        ? [{ person: toPersonRef(person), contactEveryDays: every, lastContactAt, overdueDays }]
        : [];
    })
    .sort(
      (a, b) =>
        // Longest overdue first; people never contacted after them.
        (b.overdueDays ?? -1) - (a.overdueDays ?? -1) ||
        a.person.displayName.localeCompare(b.person.displayName),
    );
}

function recent(db: Db, spaceId?: string): RecentPerson[] {
  const rows = db
    .select({ person: people, viewedAt: personViews.viewedAt })
    .from(personViews)
    .innerJoin(people, eq(people.id, personViews.personId))
    .where(and(notDeleted(people), spaceId ? eq(people.spaceId, spaceId) : undefined))
    .orderBy(desc(personViews.viewedAt))
    .limit(TODAY_RECENT_LIMIT)
    .all();
  const subtitles = personSubtitles(
    db,
    rows.map((r) => r.person),
  );
  return rows.map(({ person, viewedAt }) => ({
    person: toPersonRef(person),
    subtitle: subtitles.get(person.id) ?? null,
    viewedAt,
  }));
}

export function getToday(db: Db, query: { date?: string; spaceId?: string }): TodayResponse {
  const date = query.date ?? nowIso().slice(0, 10);
  const reminders = listReminders(db, { status: 'open' }).filter(
    (r) => r.dueOn <= date && (!query.spaceId || r.person?.spaceId === query.spaceId),
  );
  return {
    date,
    reminders,
    birthdays: birthdays(db, date, query.spaceId),
    overdueContacts: overdueContacts(db, date, query.spaceId),
    recent: recent(db, query.spaceId),
  };
}

/** Remembers that the person page was opened (for “Recently viewed”). */
export function recordView(db: Db, personId: string) {
  getLivePerson(db, personId);
  const viewedAt = nowIso();
  db.insert(personViews)
    .values({ personId, viewedAt })
    .onConflictDoUpdate({ target: personViews.personId, set: { viewedAt } })
    .run();
}
