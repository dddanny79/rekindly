import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  type NameFormat,
  type PeopleListInclude,
  personDisplayName,
  type PersonListItem,
} from '@app/shared';
import type { Db } from '../db/client';
import { addresses, contactPoints, fieldDefinitions, fieldValues } from '../db/schema';
import { notDeleted } from '../lib/sql';
import { livePeopleByIds, type PersonRow } from './refs';

type Extras = Partial<PersonListItem>;

/** The preferred email address or phone number per person, else the first one. */
function mainContactPoints(db: Db, ids: string[], kind: 'email' | 'phone') {
  const result = new Map<string, { value: string; isPrimary: boolean }>();
  const rows = db
    .select({
      personId: contactPoints.personId,
      value: contactPoints.value,
      isPrimary: contactPoints.isPrimary,
    })
    .from(contactPoints)
    .where(
      and(
        inArray(contactPoints.personId, ids),
        eq(contactPoints.kind, kind),
        notDeleted(contactPoints),
      ),
    )
    .orderBy(asc(contactPoints.sort), asc(contactPoints.createdAt))
    .all();
  for (const row of rows) {
    const current = result.get(row.personId);
    if (!current || (row.isPrimary && !current.isPrimary)) result.set(row.personId, row);
  }
  return new Map([...result].map(([id, row]) => [id, row.value]));
}

/** The city of the first address that has one. */
function cities(db: Db, ids: string[]) {
  const result = new Map<string, string>();
  const rows = db
    .select({ personId: addresses.personId, city: addresses.city })
    .from(addresses)
    .where(and(inArray(addresses.personId, ids), isNotNull(addresses.city), notDeleted(addresses)))
    .orderBy(asc(addresses.sort), asc(addresses.createdAt))
    .all();
  for (const row of rows) {
    const city = row.city?.trim();
    if (row.personId && city && !result.has(row.personId)) result.set(row.personId, city);
  }
  return result;
}

/** Custom field values by person, then by field definition id. */
function customFields(db: Db, ids: string[]) {
  const result = new Map<string, Record<string, string>>();
  const rows = db
    .select({
      targetId: fieldValues.targetId,
      definitionId: fieldValues.definitionId,
      value: fieldValues.value,
    })
    .from(fieldValues)
    .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, fieldValues.definitionId))
    .where(
      and(
        inArray(fieldValues.targetId, ids),
        eq(fieldDefinitions.target, 'person'),
        notDeleted(fieldDefinitions),
      ),
    )
    .all();
  for (const row of rows) {
    result.set(row.targetId, { ...result.get(row.targetId), [row.definitionId]: row.value });
  }
  return result;
}

/**
 * Values the people list asked for with `include=` (its chosen columns), per person.
 * Only what was asked for is loaded and returned.
 */
export function listExtras(
  db: Db,
  rows: PersonRow[],
  include: readonly PeopleListInclude[],
  names: NameFormat,
): Map<string, Extras> {
  const want = new Set(include);
  const ids = rows.map((row) => row.id);
  const result = new Map<string, Extras>(ids.map((id) => [id, {}]));
  if (want.size === 0 || ids.length === 0) return result;

  const emails = want.has('email') ? mainContactPoints(db, ids, 'email') : null;
  const phones = want.has('phone') ? mainContactPoints(db, ids, 'phone') : null;
  const cityOf = want.has('city') ? cities(db, ids) : null;
  const fields = want.has('fields') ? customFields(db, ids) : null;
  const through = want.has('met')
    ? livePeopleByIds(db, [
        ...new Set(rows.flatMap((row) => (row.metThroughPersonId ? [row.metThroughPersonId] : []))),
      ])
    : null;

  for (const row of rows) {
    const extras = result.get(row.id)!;
    if (want.has('nickname')) extras.nickname = row.nickname;
    if (want.has('pronouns')) extras.pronouns = row.pronouns;
    if (want.has('birthday')) extras.birthday = row.birthday;
    if (emails) extras.email = emails.get(row.id) ?? null;
    if (phones) extras.phone = phones.get(row.id) ?? null;
    if (cityOf) extras.city = cityOf.get(row.id) ?? null;
    if (through) {
      const other = row.metThroughPersonId ? through.get(row.metThroughPersonId) : undefined;
      extras.metWhere = row.metWhere;
      extras.metWhen = row.metWhen;
      extras.metThrough = other ? personDisplayName(other, names.displayOrder) || null : null;
    }
    if (want.has('contactRhythm')) extras.contactEveryDays = row.contactEveryDays;
    if (want.has('createdAt')) extras.createdAt = row.createdAt;
    if (fields) extras.fields = fields.get(row.id) ?? {};
  }
  return result;
}
