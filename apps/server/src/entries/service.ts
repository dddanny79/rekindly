import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  CONTACT_KINDS,
  type createEntryRequestSchema,
  type entriesQuerySchema,
  type Entry,
  entryExcerpt,
  type LastContact,
  type updateEntryRequestSchema,
} from '@app/shared';
import type { Db } from '../db/client';
import { affiliations, entries, entryPeople, organizations } from '../db/schema';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { OrgIndex } from '../organizations';
import { livePeopleByIds, toPersonRef, touchPerson } from '../people/refs';
import { addReminder } from '../reminders/service';

type In<T extends z.ZodType> = z.output<T>;
type EntryRow = typeof entries.$inferSelect;

function hydrate(db: Db, rows: EntryRow[]): Entry[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // rowid keeps the order in which people were linked (the page person first).
  const links = db
    .select()
    .from(entryPeople)
    .where(inArray(entryPeople.entryId, ids))
    .orderBy(sql`rowid`)
    .all();
  const people = livePeopleByIds(db, [...new Set(links.map((l) => l.personId))]);
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((id): id is string => !!id))];
  const orgs = new Map(
    orgIds.length
      ? db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(and(inArray(organizations.id, orgIds), notDeleted(organizations)))
          .all()
          .map((o) => [o.id, o])
      : [],
  );
  return rows.map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    kind: row.kind,
    direction: row.direction,
    occurredAt: row.occurredAt,
    title: row.title,
    bodyMd: row.bodyMd,
    organization: (row.organizationId && orgs.get(row.organizationId)) || null,
    people: links
      .filter((l) => l.entryId === row.id)
      .flatMap((l) => {
        const person = people.get(l.personId);
        return person ? [toPersonRef(person)] : [];
      }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function listEntries(db: Db, query: In<typeof entriesQuerySchema>): Entry[] {
  const conditions = [notDeleted(entries)];
  if (query.spaceId) conditions.push(eq(entries.spaceId, query.spaceId));
  if (query.kinds?.length) conditions.push(inArray(entries.kind, query.kinds));
  if (query.before) conditions.push(lt(entries.occurredAt, query.before));
  if (query.personId) {
    conditions.push(
      inArray(
        entries.id,
        db
          .select({ id: entryPeople.entryId })
          .from(entryPeople)
          .where(eq(entryPeople.personId, query.personId)),
      ),
    );
  }
  if (query.organizationId) {
    // Everyone ever linked to the organization or below it, plus entries filed there.
    const orgIds = OrgIndex.load(db).subtree(query.organizationId);
    const members = db
      .select({ id: affiliations.personId })
      .from(affiliations)
      .where(and(inArray(affiliations.organizationId, orgIds), notDeleted(affiliations)));
    conditions.push(
      or(
        inArray(entries.organizationId, orgIds),
        inArray(
          entries.id,
          db
            .select({ id: entryPeople.entryId })
            .from(entryPeople)
            .where(inArray(entryPeople.personId, members)),
        ),
      )!,
    );
  }
  const rows = db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(entries.occurredAt), desc(entries.createdAt))
    .limit(query.limit ?? 200)
    .all();
  return hydrate(db, rows);
}

export function getEntry(db: Db, id: string): Entry {
  const row = db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), notDeleted(entries)))
    .get();
  if (!row) throw notFound();
  return hydrate(db, [row])[0]!;
}

function checkPeople(db: Db, personIds: string[]) {
  const unique = [...new Set(personIds)];
  const found = livePeopleByIds(db, unique);
  if (found.size !== unique.length) throw new DomainError(400, 'unknown_person');
  return unique.map((id) => found.get(id)!);
}

function checkOrganization(db: Db, id: string | null | undefined) {
  if (!id) return;
  const org = db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, id), notDeleted(organizations)))
    .get();
  if (!org) throw new DomainError(400, 'unknown_organization');
}

export function createEntry(db: Db, input: In<typeof createEntryRequestSchema>): Entry {
  const people = checkPeople(db, input.personIds);
  checkOrganization(db, input.organizationId);
  const entry = db.transaction((tx) => {
    const row = tx
      .insert(entries)
      .values({
        // The first person (usually the page it was written on) decides the space.
        spaceId: people[0]!.spaceId,
        kind: input.kind,
        direction: input.direction ?? null,
        occurredAt: input.occurredAt ?? nowIso(),
        title: input.title ?? null,
        bodyMd: input.bodyMd,
        organizationId: input.organizationId ?? null,
      })
      .returning()
      .get();
    tx.insert(entryPeople)
      .values(people.map((p) => ({ entryId: row.id, personId: p.id })))
      .run();
    return row;
  });
  if (input.reminder) {
    addReminder(db, people[0]!.id, {
      title:
        input.reminder.title ??
        (entryExcerpt(input.title ?? null, input.bodyMd, 120) || 'Follow-up'),
      dueOn: input.reminder.dueOn,
      entryId: entry.id,
    });
  }
  people.forEach((p) => touchPerson(db, p.id));
  return getEntry(db, entry.id);
}

export function updateEntry(db: Db, id: string, input: In<typeof updateEntryRequestSchema>): Entry {
  const current = getEntry(db, id);
  const { personIds, ...fields } = input;
  const kind = fields.kind ?? current.kind;
  // A direction only makes sense for calls and messages.
  if (kind !== 'call' && kind !== 'message') fields.direction = null;
  checkOrganization(db, fields.organizationId);
  const people = personIds ? checkPeople(db, personIds) : null;
  db.transaction((tx) => {
    tx.update(entries)
      .set({ ...fields, updatedAt: nowIso() })
      .where(eq(entries.id, id))
      .run();
    if (people) {
      tx.delete(entryPeople).where(eq(entryPeople.entryId, id)).run();
      tx.insert(entryPeople)
        .values(people.map((p) => ({ entryId: id, personId: p.id })))
        .run();
    }
  });
  new Set([...current.people.map((p) => p.id), ...(people ?? []).map((p) => p.id)]).forEach((pid) =>
    touchPerson(db, pid),
  );
  return getEntry(db, id);
}

/** Moves the entry to the trash. */
export function deleteEntry(db: Db, id: string) {
  const current = getEntry(db, id);
  db.update(entries).set({ deletedAt: nowIso() }).where(eq(entries.id, id)).run();
  current.people.forEach((p) => touchPerson(db, p.id));
}

export function lastContactOf(db: Db, personId: string): LastContact | null {
  const row = db
    .select({ entry: entries })
    .from(entries)
    .innerJoin(entryPeople, eq(entryPeople.entryId, entries.id))
    .where(
      and(
        eq(entryPeople.personId, personId),
        notDeleted(entries),
        inArray(entries.kind, [...CONTACT_KINDS]),
      ),
    )
    .orderBy(desc(entries.occurredAt))
    .limit(1)
    .get();
  if (!row) return null;
  const { entry } = row;
  return {
    entryId: entry.id,
    occurredAt: entry.occurredAt,
    kind: entry.kind,
    direction: entry.direction,
    excerpt: entryExcerpt(entry.title, entry.bodyMd),
  };
}
