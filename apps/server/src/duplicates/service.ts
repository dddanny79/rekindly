import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  personDisplayName,
  personInitials,
  type DuplicatePair,
  type DuplicatePerson,
  type MergeField,
  type Person,
} from '@app/shared';
import { getAccountRow } from '../auth/account';
import { addressKey } from '../dav/inbound';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactPoints,
  davExtras,
  duplicateDismissals,
  entryPeople,
  facts,
  fieldValues,
  organizations,
  people,
  personTags,
  relationships,
  relationshipTypes,
  reminders,
} from '../db/schema';
import { createEntry } from '../entries/service';
import {
  emailKey,
  nameKey,
  phoneKey,
  pointIdentity as pointKey,
  type MatchReason,
} from '../contact-imports/match';
import { fileUrl } from '../files/service';
import { DomainError } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { getPerson, mainAffiliation } from '../people/service';
import { getLivePerson, touchPerson } from '../people/refs';

const ORDER: MatchReason[] = ['email', 'phone', 'name'];
/** A key shared by more people than this (e.g. an office switchboard) is no hint. */
const MAX_PER_KEY = 10;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Likely duplicates: people (also indirect contacts, in all spaces) with the same
 * email, phone number (last nine digits) or first and last name (folded), minus
 * the pairs marked as different.
 */
export function findDuplicates(db: Db): DuplicatePair[] {
  const rows = db.select().from(people).where(notDeleted(people)).all();
  const byId = new Map(rows.map((p) => [p.id, p]));
  const keys = new Map<string, Set<string>>();
  const add = (key: string | null, personId: string) => {
    if (!key) return;
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key)!.add(personId);
  };
  const points = db
    .select({
      personId: contactPoints.personId,
      kind: contactPoints.kind,
      value: contactPoints.value,
    })
    .from(contactPoints)
    .where(isNull(contactPoints.deletedAt))
    .all();
  for (const p of points) {
    if (!byId.has(p.personId)) continue;
    if (p.kind === 'email') add(`email:${emailKey(p.value) ?? ''}`, p.personId);
    if (p.kind === 'phone') {
      const key = phoneKey(p.value);
      add(key && `phone:${key}`, p.personId);
    }
  }
  for (const p of rows) {
    const key = nameKey(p.firstName, p.lastName);
    add(key && `name:${key}`, p.id);
  }

  const dismissed = new Set(
    db
      .select()
      .from(duplicateDismissals)
      .all()
      .map((d) => pairKey(d.personAId, d.personBId)),
  );
  const pairs = new Map<string, Set<MatchReason>>();
  for (const [key, ids] of keys) {
    if (ids.size < 2 || ids.size > MAX_PER_KEY || key.endsWith(':')) continue;
    const reason = key.slice(0, key.indexOf(':')) as MatchReason;
    const list = [...ids].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const pk = pairKey(list[i]!, list[j]!);
        if (dismissed.has(pk)) continue;
        if (!pairs.has(pk)) pairs.set(pk, new Set());
        pairs.get(pk)!.add(reason);
      }
    }
  }

  const ids = [...new Set([...pairs.keys()].flatMap((k) => k.split('|')))];
  const details = personDetails(db, ids);
  const side = (id: string): DuplicatePerson => {
    const p = byId.get(id)!;
    return {
      id: p.id,
      spaceId: p.spaceId,
      displayName: personDisplayName(p),
      initials: personInitials(p),
      photoUrl: fileUrl(p.photoFileId),
      summary: p.summary,
      details: details.get(id) ?? null,
      listed: p.listed,
      archivedAt: p.archivedAt,
      updatedAt: p.updatedAt,
    };
  };
  return [...pairs]
    .map(([pk, reasons]) => {
      const [a, b] = pk.split('|') as [string, string];
      return { a: side(a), b: side(b), reasons: ORDER.filter((r) => reasons.has(r)) };
    })
    .sort(
      (x, y) =>
        y.reasons.length - x.reasons.length ||
        ORDER.indexOf(x.reasons[0]!) - ORDER.indexOf(y.reasons[0]!) ||
        x.a.displayName.localeCompare(y.a.displayName),
    );
}

/** "Beispiel GmbH · jana@example.com" for each person. */
function personDetails(db: Db, ids: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (!ids.length) return result;
  const links = db
    .select({ a: affiliations, name: organizations.name })
    .from(affiliations)
    .innerJoin(organizations, eq(organizations.id, affiliations.organizationId))
    .where(
      and(
        inArray(affiliations.personId, ids),
        isNull(affiliations.deletedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .all();
  const points = db
    .select()
    .from(contactPoints)
    .where(and(inArray(contactPoints.personId, ids), isNull(contactPoints.deletedAt)))
    .all();
  for (const id of ids) {
    const mine = links.filter((l) => l.a.personId === id);
    const main = mainAffiliation(mine.map((l) => l.a));
    const org = main ? mine.find((l) => l.a.id === main.id)?.name : undefined;
    const own = points.filter((p) => p.personId === id).sort((a, b) => a.sort - b.sort);
    const point = own.find((p) => p.kind === 'email') ?? own.find((p) => p.kind === 'phone');
    const text = [org, point?.value].filter(Boolean).join(' · ');
    if (text) result.set(id, text);
  }
  return result;
}

export function dismissDuplicate(db: Db, [first, second]: [string, string]) {
  if (first === second) throw new DomainError(400, 'invalid_person');
  getLivePerson(db, first);
  getLivePerson(db, second);
  const [personAId, personBId] = first < second ? [first, second] : [second, first];
  db.insert(duplicateDismissals).values({ personAId, personBId }).onConflictDoNothing().run();
}

// Merging ------------------------------------------------------------------------------------

const NAME_FIELDS = ['prefix', 'firstName', 'middleName', 'lastName', 'suffix'] as const;
const SIMPLE_FIELDS = [
  'nickname',
  'maidenName',
  'pronouns',
  'birthday',
  'summary',
  'metWhere',
  'metWhen',
] as const;

const TEXT = {
  en: { title: 'Merged', body: '{{name}} was merged into this person.' },
  de: { title: 'Zusammengeführt', body: '{{name}} wurde mit dieser Person zusammengeführt.' },
};

/**
 * Merges `mergeId` into `keepId`: chosen values are taken over, empty ones filled;
 * contact details, addresses, organizations, facts, follow-ups, timeline,
 * relationships, tags and custom fields are combined (exact duplicates dropped).
 * The merged person goes to the trash.
 */
export function mergePeople(db: Db, keepId: string, mergeId: string, take: MergeField[]): Person {
  if (keepId === mergeId) throw new DomainError(400, 'invalid_person');
  const keep = getLivePerson(db, keepId);
  const other = getLivePerson(db, mergeId);
  const taken = new Set(take);
  const now = nowIso();

  db.transaction(() => {
    // Values: taken where chosen, filled where empty.
    const set: Partial<typeof people.$inferInsert> = {};
    if (taken.has('name') && personDisplayName(other)) {
      for (const f of NAME_FIELDS) set[f] = other[f];
    } else {
      for (const f of NAME_FIELDS) if (!keep[f] && other[f]) set[f] = other[f];
    }
    for (const f of SIMPLE_FIELDS) {
      if (other[f] && (taken.has(f) || !keep[f])) set[f] = other[f];
    }
    const through = other.metThroughPersonId === keepId ? null : other.metThroughPersonId;
    if (keep.metThroughPersonId === mergeId) set.metThroughPersonId = through;
    else if (through && (taken.has('metThrough') || !keep.metThroughPersonId)) {
      set.metThroughPersonId = through;
    }
    if (other.photoFileId && (taken.has('photo') || !keep.photoFileId)) {
      set.photoFileId = other.photoFileId;
    }
    if (other.contactEveryDays && (taken.has('contactEveryDays') || !keep.contactEveryDays)) {
      set.contactEveryDays = other.contactEveryDays;
      set.contactRhythmSince = other.contactRhythmSince ?? keep.contactRhythmSince ?? now;
    }
    if (taken.has('space')) set.spaceId = other.spaceId;
    set.favorite = keep.favorite || other.favorite;
    set.listed = keep.listed || other.listed;
    set.archivedAt = keep.archivedAt && other.archivedAt ? keep.archivedAt : null;
    set.updatedAt = now;
    db.update(people).set(set).where(eq(people.id, keepId)).run();

    // Contact details and addresses: move what the kept person does not have yet.
    const keptPoints = db
      .select()
      .from(contactPoints)
      .where(and(eq(contactPoints.personId, keepId), isNull(contactPoints.deletedAt)))
      .all();
    const pointKeys = new Set(keptPoints.map(pointKey));
    const primaryKinds = new Set(keptPoints.filter((p) => p.isPrimary).map((p) => p.kind));
    let sort = keptPoints.length;
    for (const p of db
      .select()
      .from(contactPoints)
      .where(and(eq(contactPoints.personId, mergeId), isNull(contactPoints.deletedAt)))
      .all()) {
      if (pointKeys.has(pointKey(p))) continue;
      pointKeys.add(pointKey(p));
      db.update(contactPoints)
        .set({
          personId: keepId,
          sort: sort++,
          isPrimary: p.isPrimary && !primaryKinds.has(p.kind),
        })
        .where(eq(contactPoints.id, p.id))
        .run();
    }
    const placeKeys = new Set(
      db
        .select()
        .from(addresses)
        .where(and(eq(addresses.personId, keepId), isNull(addresses.deletedAt)))
        .all()
        .map(addressKey),
    );
    for (const a of db
      .select()
      .from(addresses)
      .where(and(eq(addresses.personId, mergeId), isNull(addresses.deletedAt)))
      .all()) {
      if (placeKeys.has(addressKey(a))) continue;
      placeKeys.add(addressKey(a));
      db.update(addresses).set({ personId: keepId }).where(eq(addresses.id, a.id)).run();
    }

    // Organizations: one link per organization; the kept person's main one stays main.
    const keptLinks = db
      .select()
      .from(affiliations)
      .where(and(eq(affiliations.personId, keepId), isNull(affiliations.deletedAt)))
      .all();
    const orgs = new Set(keptLinks.map((a) => a.organizationId));
    const hasPrimary = keptLinks.some((a) => a.isPrimary);
    for (const a of db
      .select()
      .from(affiliations)
      .where(and(eq(affiliations.personId, mergeId), isNull(affiliations.deletedAt)))
      .all()) {
      if (orgs.has(a.organizationId)) continue;
      orgs.add(a.organizationId);
      db.update(affiliations)
        .set({ personId: keepId, isPrimary: a.isPrimary && !hasPrimary })
        .where(eq(affiliations.id, a.id))
        .run();
    }

    // Facts (same text once), follow-ups.
    const factTexts = new Set(
      db
        .select({ text: facts.text })
        .from(facts)
        .where(and(eq(facts.personId, keepId), isNull(facts.deletedAt)))
        .all()
        .map((f) => f.text.trim()),
    );
    for (const f of db
      .select()
      .from(facts)
      .where(and(eq(facts.personId, mergeId), isNull(facts.deletedAt)))
      .all()) {
      if (factTexts.has(f.text.trim())) continue;
      factTexts.add(f.text.trim());
      db.update(facts).set({ personId: keepId }).where(eq(facts.id, f.id)).run();
    }
    db.update(reminders)
      .set({ personId: keepId })
      .where(and(eq(reminders.personId, mergeId), isNull(reminders.deletedAt)))
      .run();

    // Timeline: every entry of the merged person now belongs to the kept one.
    const keptEntries = new Set(
      db
        .select({ id: entryPeople.entryId })
        .from(entryPeople)
        .where(eq(entryPeople.personId, keepId))
        .all()
        .map((e) => e.id),
    );
    for (const link of db
      .select()
      .from(entryPeople)
      .where(eq(entryPeople.personId, mergeId))
      .all()) {
      if (keptEntries.has(link.entryId)) {
        db.delete(entryPeople)
          .where(and(eq(entryPeople.entryId, link.entryId), eq(entryPeople.personId, mergeId)))
          .run();
      } else {
        db.update(entryPeople)
          .set({ personId: keepId })
          .where(and(eq(entryPeople.entryId, link.entryId), eq(entryPeople.personId, mergeId)))
          .run();
      }
    }

    // Relationships: re-pointed; one between the two, or a second copy, goes to the trash.
    const symmetric = new Set(
      db
        .select({ id: relationshipTypes.id })
        .from(relationshipTypes)
        .where(eq(relationshipTypes.symmetric, true))
        .all()
        .map((t) => t.id),
    );
    const relKey = (r: { fromPersonId: string; toPersonId: string; typeId: string }) =>
      symmetric.has(r.typeId)
        ? `${r.typeId}|${pairKey(r.fromPersonId, r.toPersonId)}`
        : `${r.typeId}|${r.fromPersonId}|${r.toPersonId}`;
    const keptRelations = new Set(
      db
        .select()
        .from(relationships)
        .where(
          and(
            or(eq(relationships.fromPersonId, keepId), eq(relationships.toPersonId, keepId)),
            isNull(relationships.deletedAt),
          ),
        )
        .all()
        .map(relKey),
    );
    for (const r of db
      .select()
      .from(relationships)
      .where(
        and(
          or(eq(relationships.fromPersonId, mergeId), eq(relationships.toPersonId, mergeId)),
          isNull(relationships.deletedAt),
        ),
      )
      .all()) {
      const moved = {
        fromPersonId: r.fromPersonId === mergeId ? keepId : r.fromPersonId,
        toPersonId: r.toPersonId === mergeId ? keepId : r.toPersonId,
        typeId: r.typeId,
      };
      if (moved.fromPersonId === moved.toPersonId || keptRelations.has(relKey(moved))) {
        db.update(relationships).set({ deletedAt: now }).where(eq(relationships.id, r.id)).run();
        continue;
      }
      keptRelations.add(relKey(moved));
      db.update(relationships).set(moved).where(eq(relationships.id, r.id)).run();
    }

    // Tags, custom fields (the kept person's value wins), "met through", vCard extras.
    for (const link of db.select().from(personTags).where(eq(personTags.personId, mergeId)).all()) {
      db.insert(personTags)
        .values({ personId: keepId, tagId: link.tagId })
        .onConflictDoNothing()
        .run();
    }
    db.delete(personTags).where(eq(personTags.personId, mergeId)).run();
    const keptFields = new Set(
      db
        .select({ id: fieldValues.definitionId })
        .from(fieldValues)
        .where(eq(fieldValues.targetId, keepId))
        .all()
        .map((f) => f.id),
    );
    for (const value of db
      .select()
      .from(fieldValues)
      .where(eq(fieldValues.targetId, mergeId))
      .all()) {
      if (keptFields.has(value.definitionId)) continue;
      db.update(fieldValues)
        .set({ targetId: keepId })
        .where(
          and(eq(fieldValues.definitionId, value.definitionId), eq(fieldValues.targetId, mergeId)),
        )
        .run();
    }
    db.update(people)
      .set({ metThroughPersonId: keepId })
      .where(eq(people.metThroughPersonId, mergeId))
      .run();
    const hasExtras = db.select().from(davExtras).where(eq(davExtras.personId, keepId)).get();
    if (!hasExtras) {
      db.update(davExtras).set({ personId: keepId }).where(eq(davExtras.personId, mergeId)).run();
    }
    db.update(people)
      .set({ metThroughPersonId: null })
      .where(and(eq(people.id, keepId), eq(people.metThroughPersonId, keepId)))
      .run();

    // The merged person goes to the trash; a hidden note keeps the trace.
    db.update(people).set({ deletedAt: now }).where(eq(people.id, mergeId)).run();
    const t = TEXT[getAccountRow(db)?.locale === 'de' ? 'de' : 'en'];
    createEntry(
      db,
      {
        kind: 'note',
        title: t.title,
        bodyMd: t.body.replace('{{name}}', personDisplayName(other) || '?'),
        personIds: [keepId],
      },
      'sync',
    );
    touchPerson(db, keepId);
  });
  return getPerson(db, keepId);
}
