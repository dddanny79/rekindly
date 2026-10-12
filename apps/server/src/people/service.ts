import { and, asc, eq, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import {
  CONTACT_KINDS,
  type Affiliation,
  type ContactPoint,
  type Person,
  type PersonListItem,
  type Relationship,
  personDisplayName,
  personInitials,
  personSortName,
} from '@app/shared';
import type { z } from 'zod';
import type {
  createAffiliationRequestSchema,
  createContactPointRequestSchema,
  createPersonRequestSchema,
  createRelationshipRequestSchema,
  peopleQuerySchema,
  updateAffiliationRequestSchema,
  updateContactPointRequestSchema,
  updatePersonRequestSchema,
} from '@app/shared';
import type { Db } from '../db/client';
import {
  affiliations,
  contactPoints,
  entries,
  entryPeople,
  organizations,
  people,
  personTags,
  relationships,
} from '../db/schema';
import { fieldValuesFor } from '../catalog/fields';
import { getRelationshipType } from '../catalog/relationship-types';
import { ensureTag, tagsForPeople } from '../catalog/tags';
import { lastContactOf } from '../entries/service';
import { listFacts } from '../facts/service';
import { fileUrl } from '../files/service';
import { DomainError, notFound } from '../lib/errors';
import { foldedContains, notDeleted, nowIso } from '../lib/sql';
import { OrgIndex } from '../organizations';
import { listReminders } from '../reminders/service';
import { getLiveSpace } from '../spaces/service';
import { listAddresses } from './addresses';
import { relatedToFor } from './related';
import { getLivePerson, livePeopleByIds, type PersonRow, toPersonRef, touchPerson } from './refs';

type In<T extends z.ZodType> = z.output<T>;

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Current = not ended. The primary one wins, then the most recently started. */
export function mainAffiliation<
  T extends {
    isPrimary: boolean;
    endedOn: string | null;
    startedOn: string | null;
    createdAt: string;
  },
>(list: T[]): T | undefined {
  const current = list.filter((a) => !a.endedOn);
  return [...current].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      (b.startedOn ?? '').localeCompare(a.startedOn ?? '') ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
}

function liveAffiliations(db: Db, personIds: string[]) {
  if (personIds.length === 0) return [];
  return db
    .select()
    .from(affiliations)
    .innerJoin(organizations, eq(organizations.id, affiliations.organizationId))
    .where(
      and(
        inArray(affiliations.personId, personIds),
        notDeleted(affiliations),
        notDeleted(organizations),
      ),
    )
    .all()
    .map((row) => row.affiliations);
}

/** “Role @ Organization” from the main affiliation, else the summary. */
export function personSubtitles(db: Db, rows: PersonRow[]): Map<string, string | null> {
  const orgIndex = OrgIndex.load(db);
  const byPerson = new Map<string, ReturnType<typeof liveAffiliations>>();
  for (const a of liveAffiliations(
    db,
    rows.map((r) => r.id),
  )) {
    byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a]);
  }
  return new Map(
    rows.map((person) => {
      const main = mainAffiliation(byPerson.get(person.id) ?? []);
      const org = main ? orgIndex.byId.get(main.organizationId) : undefined;
      const subtitle =
        main?.role && org
          ? `${main.role} @ ${org.name}`
          : (org?.name ?? main?.role ?? person.summary);
      return [person.id, subtitle ?? null];
    }),
  );
}

// List ------------------------------------------------------------------------------

export function listPeople(db: Db, query: In<typeof peopleQuerySchema>): PersonListItem[] {
  const conditions = [notDeleted(people)];
  if (query.spaceId) conditions.push(eq(people.spaceId, query.spaceId));
  if (query.favorite !== undefined) conditions.push(eq(people.favorite, query.favorite));
  conditions.push(query.archived ? isNotNull(people.archivedAt) : isNull(people.archivedAt));
  const listed = query.listed ?? 'contacts';
  if (listed !== 'all') conditions.push(eq(people.listed, listed === 'contacts'));
  if (query.q) {
    const haystack = sql`coalesce(${people.prefix}, '') || ' ' || coalesce(${people.firstName}, '') || ' ' || coalesce(${people.middleName}, '') || ' ' || coalesce(${people.lastName}, '') || ' ' || coalesce(${people.nickname}, '') || ' ' || coalesce(${people.maidenName}, '')`;
    conditions.push(foldedContains(haystack, query.q));
  }
  if (query.tagId) {
    conditions.push(
      inArray(
        people.id,
        db
          .select({ id: personTags.personId })
          .from(personTags)
          .where(eq(personTags.tagId, query.tagId)),
      ),
    );
  }
  if (query.organizationId) {
    // Includes everyone in sub-organizations.
    const orgIds = OrgIndex.load(db).subtree(query.organizationId);
    conditions.push(
      inArray(
        people.id,
        db
          .select({ id: affiliations.personId })
          .from(affiliations)
          .where(and(inArray(affiliations.organizationId, orgIds), notDeleted(affiliations))),
      ),
    );
  }

  const lastContact = db
    .select({ personId: entryPeople.personId, at: max(entries.occurredAt).as('last_contact_at') })
    .from(entryPeople)
    .innerJoin(entries, eq(entries.id, entryPeople.entryId))
    // Only calls, meetings and messages count as contact.
    .where(and(notDeleted(entries), inArray(entries.kind, [...CONTACT_KINDS])))
    .groupBy(entryPeople.personId)
    .as('last_contact');

  const rows = db
    .select({ person: people, lastContactAt: lastContact.at })
    .from(people)
    .leftJoin(lastContact, eq(lastContact.personId, people.id))
    .where(and(...conditions))
    .all();

  const ids = rows.map((r) => r.person.id);
  const tagsByPerson = tagsForPeople(db, ids);
  const orgIndex = OrgIndex.load(db);
  const affiliationsByPerson = new Map<string, ReturnType<typeof liveAffiliations>>();
  for (const a of liveAffiliations(db, ids)) {
    affiliationsByPerson.set(a.personId, [...(affiliationsByPerson.get(a.personId) ?? []), a]);
  }

  const items = rows.map(({ person, lastContactAt }) => {
    const main = mainAffiliation(affiliationsByPerson.get(person.id) ?? []);
    const org = main ? orgIndex.byId.get(main.organizationId) : undefined;
    return {
      sortName: personSortName(person),
      item: {
        id: person.id,
        spaceId: person.spaceId,
        displayName: personDisplayName(person),
        initials: personInitials(person),
        summary: person.summary,
        photoUrl: fileUrl(person.photoFileId),
        favorite: person.favorite,
        listed: person.listed,
        archivedAt: person.archivedAt,
        role: main?.role ?? null,
        organization: org ? { id: org.id, name: org.name } : null,
        tags: tagsByPerson.get(person.id) ?? [],
        lastContactAt: (lastContactAt as string | null) ?? null,
        updatedAt: person.updatedAt,
      } satisfies PersonListItem,
    };
  });

  const sort = query.sort ?? 'name';
  const direction = (query.order ?? (sort === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    if (sort === 'updated') return direction * a.item.updatedAt.localeCompare(b.item.updatedAt);
    if (sort === 'lastContact') {
      // People never contacted go last in either direction.
      const x = a.item.lastContactAt;
      const y = b.item.lastContactAt;
      if (x !== y && (!x || !y)) return x ? -1 : 1;
      if (x && y && x !== y) return direction * x.localeCompare(y);
    }
    return direction * collator.compare(a.sortName, b.sortName);
  });
  return items.map((entry) => entry.item);
}

// Detail ----------------------------------------------------------------------------

function toContactPoint(row: typeof contactPoints.$inferSelect): ContactPoint {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    value: row.value,
    isPrimary: row.isPrimary,
  };
}

export function getPerson(db: Db, id: string): Person {
  const person = getLivePerson(db, id);
  const orgIndex = OrgIndex.load(db);

  const points = db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.personId, id), notDeleted(contactPoints)))
    .orderBy(asc(contactPoints.sort), asc(contactPoints.createdAt))
    .all()
    .map(toContactPoint);

  const personAffiliations: Affiliation[] = liveAffiliations(db, [id])
    .sort(
      (a, b) =>
        Number(!!a.endedOn) - Number(!!b.endedOn) ||
        Number(b.isPrimary) - Number(a.isPrimary) ||
        (b.startedOn ?? '').localeCompare(a.startedOn ?? '') ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .flatMap((a) => {
      const organization = orgIndex.ref(a.organizationId);
      return organization
        ? [
            {
              id: a.id,
              role: a.role,
              startedOn: a.startedOn,
              endedOn: a.endedOn,
              isPrimary: a.isPrimary,
              organization,
            },
          ]
        : [];
    });

  const relRows = db
    .select()
    .from(relationships)
    .where(
      and(
        or(eq(relationships.fromPersonId, id), eq(relationships.toPersonId, id)),
        notDeleted(relationships),
      ),
    )
    .orderBy(asc(relationships.createdAt))
    .all();
  const others = livePeopleByIds(
    db,
    relRows.map((r) => (r.fromPersonId === id ? r.toPersonId : r.fromPersonId)),
  );
  const personRelationships: Relationship[] = relRows.flatMap((r) => {
    const outgoing = r.fromPersonId === id;
    const other = others.get(outgoing ? r.toPersonId : r.fromPersonId);
    const type = getRelationshipType(db, r.typeId, { includeDeleted: true });
    if (!other || !type) return [];
    return [
      {
        id: r.id,
        typeId: r.typeId,
        label: outgoing
          ? { name: type.name, nameKey: type.nameKey }
          : { name: type.reverseName, nameKey: type.reverseNameKey },
        person: toPersonRef(other),
        note: r.note,
      },
    ];
  });

  const metThrough = person.metThroughPersonId
    ? (livePeopleByIds(db, [person.metThroughPersonId]).get(person.metThroughPersonId) ?? null)
    : null;

  return {
    id: person.id,
    spaceId: person.spaceId,
    displayName: personDisplayName(person),
    initials: personInitials(person),
    prefix: person.prefix,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    suffix: person.suffix,
    nickname: person.nickname,
    maidenName: person.maidenName,
    pronouns: person.pronouns,
    birthday: person.birthday,
    summary: person.summary,
    metWhere: person.metWhere,
    metWhen: person.metWhen,
    metThrough: metThrough ? toPersonRef(metThrough) : null,
    photoUrl: fileUrl(person.photoFileId),
    favorite: person.favorite,
    listed: person.listed,
    relatedTo: person.listed ? null : (relatedToFor(db, [id]).get(id) ?? null),
    contactEveryDays: person.contactEveryDays,
    archivedAt: person.archivedAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
    contactPoints: points,
    addresses: listAddresses(db, { personId: id }),
    affiliations: personAffiliations,
    relationships: personRelationships,
    tags: tagsForPeople(db, [id]).get(id) ?? [],
    fields: fieldValuesFor(db, [id]).get(id) ?? [],
    facts: listFacts(db, id),
    reminders: listReminders(db, { personId: id, status: 'open' }),
    lastContact: lastContactOf(db, id),
  };
}

// Writes ------------------------------------------------------------------------------

function liveOrganization(db: Db, id: string) {
  const org = db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), notDeleted(organizations)))
    .get();
  if (!org) throw new DomainError(400, 'unknown_organization');
  return org;
}

export function createPerson(db: Db, input: In<typeof createPersonRequestSchema>): Person {
  getLiveSpace(db, input.spaceId);
  const org = input.organizationId ? liveOrganization(db, input.organizationId) : null;
  if (org && org.spaceId !== input.spaceId) throw new DomainError(400, 'space_mismatch');
  const person = db.transaction((tx) => {
    const row = tx
      .insert(people)
      .values({
        spaceId: input.spaceId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        listed: input.listed ?? true,
      })
      .returning()
      .get();
    if (org) {
      tx.insert(affiliations)
        .values({
          personId: row.id,
          organizationId: org.id,
          role: input.role ?? null,
          isPrimary: true,
        })
        .run();
    }
    return row;
  });
  return getPerson(db, person.id);
}

export function updatePerson(
  db: Db,
  id: string,
  input: In<typeof updatePersonRequestSchema>,
): Person {
  const current = getLivePerson(db, id);
  const { archived, ...fields } = input;
  if (fields.spaceId) getLiveSpace(db, fields.spaceId);
  if (fields.metThroughPersonId) {
    if (fields.metThroughPersonId === id) throw new DomainError(400, 'invalid_person');
    if (!livePeopleByIds(db, [fields.metThroughPersonId]).size)
      throw new DomainError(400, 'unknown_person');
  }
  const next = { ...current, ...fields };
  if (!personDisplayName(next)) throw new DomainError(400, 'name_required');
  db.update(people)
    .set({
      ...fields,
      ...(archived === undefined
        ? {}
        : { archivedAt: archived ? (current.archivedAt ?? nowIso()) : null }),
      updatedAt: nowIso(),
    })
    .where(eq(people.id, id))
    .run();
  return getPerson(db, id);
}

/** Moves the person to the trash (restorable for 30 days). */
export function deletePerson(db: Db, id: string) {
  getLivePerson(db, id);
  db.update(people).set({ deletedAt: nowIso() }).where(eq(people.id, id)).run();
}

export function setPhoto(db: Db, id: string, fileId: string | null): PersonRow {
  const current = getLivePerson(db, id);
  db.update(people)
    .set({ photoFileId: fileId, updatedAt: nowIso() })
    .where(eq(people.id, id))
    .run();
  return current;
}

// Contact points --------------------------------------------------------------------

/** At most one primary contact point per kind. */
function clearPrimary(db: Db, personId: string, kind: ContactPoint['kind'], exceptId: string) {
  db.update(contactPoints)
    .set({ isPrimary: false })
    .where(
      and(
        eq(contactPoints.personId, personId),
        eq(contactPoints.kind, kind),
        sql`${contactPoints.id} != ${exceptId}`,
      ),
    )
    .run();
}

export function addContactPoint(
  db: Db,
  personId: string,
  input: In<typeof createContactPointRequestSchema>,
) {
  getLivePerson(db, personId);
  const sort = db
    .select({ n: sql<number>`count(*)` })
    .from(contactPoints)
    .where(eq(contactPoints.personId, personId))
    .get()!.n;
  const row = db
    .insert(contactPoints)
    .values({ personId, ...input, sort })
    .returning()
    .get();
  if (row.isPrimary) clearPrimary(db, personId, row.kind, row.id);
  touchPerson(db, personId);
  return toContactPoint(row);
}

export function updateContactPoint(
  db: Db,
  personId: string,
  id: string,
  input: In<typeof updateContactPointRequestSchema>,
) {
  const row = db
    .update(contactPoints)
    .set(input)
    .where(
      and(
        eq(contactPoints.id, id),
        eq(contactPoints.personId, personId),
        notDeleted(contactPoints),
      ),
    )
    .returning()
    .get();
  if (!row) throw notFound();
  if (row.isPrimary) clearPrimary(db, personId, row.kind, row.id);
  touchPerson(db, personId);
  return toContactPoint(row);
}

export function deleteContactPoint(db: Db, personId: string, id: string) {
  const res = db
    .update(contactPoints)
    .set({ deletedAt: nowIso() })
    .where(
      and(
        eq(contactPoints.id, id),
        eq(contactPoints.personId, personId),
        notDeleted(contactPoints),
      ),
    )
    .run();
  if (res.changes === 0) throw notFound();
  touchPerson(db, personId);
}

// Affiliations ----------------------------------------------------------------------

function clearPrimaryAffiliation(db: Db, personId: string, exceptId: string) {
  db.update(affiliations)
    .set({ isPrimary: false })
    .where(and(eq(affiliations.personId, personId), sql`${affiliations.id} != ${exceptId}`))
    .run();
}

export function addAffiliation(
  db: Db,
  personId: string,
  input: In<typeof createAffiliationRequestSchema>,
) {
  const person = getLivePerson(db, personId);
  const org = liveOrganization(db, input.organizationId);
  if (org.spaceId !== person.spaceId) throw new DomainError(400, 'space_mismatch');
  const row = db
    .insert(affiliations)
    .values({ personId, ...input })
    .returning()
    .get();
  if (row.isPrimary) clearPrimaryAffiliation(db, personId, row.id);
  touchPerson(db, personId);
  return getPerson(db, personId).affiliations.find((a) => a.id === row.id)!;
}

export function updateAffiliation(
  db: Db,
  personId: string,
  id: string,
  input: In<typeof updateAffiliationRequestSchema>,
) {
  const row = db
    .update(affiliations)
    .set(input)
    .where(
      and(eq(affiliations.id, id), eq(affiliations.personId, personId), notDeleted(affiliations)),
    )
    .returning()
    .get();
  if (!row) throw notFound();
  if (row.isPrimary) clearPrimaryAffiliation(db, personId, row.id);
  touchPerson(db, personId);
  const updated = getPerson(db, personId).affiliations.find((a) => a.id === id);
  if (!updated) throw notFound();
  return updated;
}

export function deleteAffiliation(db: Db, personId: string, id: string) {
  const res = db
    .update(affiliations)
    .set({ deletedAt: nowIso() })
    .where(
      and(eq(affiliations.id, id), eq(affiliations.personId, personId), notDeleted(affiliations)),
    )
    .run();
  if (res.changes === 0) throw notFound();
  touchPerson(db, personId);
}

// Relationships ---------------------------------------------------------------------

export function addRelationship(
  db: Db,
  personId: string,
  input: In<typeof createRelationshipRequestSchema>,
) {
  const person = getLivePerson(db, personId);
  if (input.personId === personId) throw new DomainError(400, 'invalid_person');
  if (input.personId && !livePeopleByIds(db, [input.personId]).size)
    throw new DomainError(400, 'unknown_person');
  if (!getRelationshipType(db, input.typeId))
    throw new DomainError(400, 'unknown_relationship_type');
  const { row, otherId } = db.transaction((tx) => {
    // A new person from the relationship form: same space, indirect by default.
    const otherId =
      input.personId ??
      tx
        .insert(people)
        .values({
          spaceId: person.spaceId,
          firstName: input.newPerson!.firstName ?? null,
          lastName: input.newPerson!.lastName ?? null,
          listed: input.newPerson!.listed ?? false,
        })
        .returning()
        .get().id;
    const row = tx
      .insert(relationships)
      .values({
        fromPersonId: input.reverse ? otherId : personId,
        toPersonId: input.reverse ? personId : otherId,
        typeId: input.typeId,
        note: input.note ?? null,
      })
      .returning()
      .get();
    return { row, otherId };
  });
  touchPerson(db, personId);
  touchPerson(db, otherId);
  return getPerson(db, personId).relationships.find((r) => r.id === row.id)!;
}

const relationshipOf = (personId: string, id: string) =>
  and(
    eq(relationships.id, id),
    or(eq(relationships.fromPersonId, personId), eq(relationships.toPersonId, personId)),
    notDeleted(relationships),
  );

export function updateRelationship(db: Db, personId: string, id: string, note: string | null) {
  const row = db
    .update(relationships)
    .set({ note })
    .where(relationshipOf(personId, id))
    .returning()
    .get();
  if (!row) throw notFound();
  return getPerson(db, personId).relationships.find((r) => r.id === id)!;
}

export function deleteRelationship(db: Db, personId: string, id: string) {
  const row = db
    .update(relationships)
    .set({ deletedAt: nowIso() })
    .where(relationshipOf(personId, id))
    .returning()
    .get();
  if (!row) throw notFound();
  touchPerson(db, row.fromPersonId);
  touchPerson(db, row.toPersonId);
}

// Tags ------------------------------------------------------------------------------

export function addPersonTag(db: Db, personId: string, name: string) {
  getLivePerson(db, personId);
  const tag = ensureTag(db, name.replace(/^#/, '').trim());
  db.insert(personTags).values({ personId, tagId: tag.id }).onConflictDoNothing().run();
  touchPerson(db, personId);
  return { id: tag.id, name: tag.name, color: tag.color };
}

export function removePersonTag(db: Db, personId: string, tagId: string) {
  getLivePerson(db, personId);
  db.delete(personTags)
    .where(and(eq(personTags.personId, personId), eq(personTags.tagId, tagId)))
    .run();
  touchPerson(db, personId);
}
