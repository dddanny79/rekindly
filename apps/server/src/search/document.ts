import { and, desc, eq, inArray } from 'drizzle-orm';
import { type EntryKind, foldText, personDisplayName, type SearchField } from '@app/shared';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactPoints,
  entries,
  entryPeople,
  facts,
  fieldDefinitions,
  fieldValues,
  organizations,
  people,
  personTags,
  tags,
} from '../db/schema';
import { notDeleted } from '../lib/sql';
import type { OrgIndex } from '../organizations';

/** One indexed text, kept in `search_documents.fields` to explain hits. */
export interface StoredField {
  f: SearchField;
  t: string;
  /** Label (custom field, contact point). */
  l?: string;
  /** Timeline entry: id, kind, occurred at. */
  e?: [string, EntryKind, string];
}

/** FTS columns, in order; their weights are in `search/service.ts`. */
export interface SearchDocument {
  entityType: 'person' | 'organization';
  entityId: string;
  spaceId: string;
  /** Indirect contacts rank after contacts. */
  listed: boolean;
  fields: StoredField[];
  name: string;
  details: string;
  notes: string;
}

const COLUMN: Record<SearchField, 'name' | 'details' | 'notes'> = {
  name: 'name',
  role: 'details',
  organization: 'details',
  fact: 'details',
  summary: 'details',
  tag: 'details',
  contact: 'details',
  address: 'details',
  field: 'details',
  met: 'details',
  website: 'details',
  entry: 'notes',
  notes: 'notes',
};

/** Markdown to one line of plain text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s*|\d+\.\s+)/gm, '')
    .replace(/(\*\*|__|`+|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const line = (...parts: (string | null | undefined)[]) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

/** Splits ids into chunks that fit into SQLite's parameter limit. */
function chunks<T>(list: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

function toDocument(
  entityType: SearchDocument['entityType'],
  entityId: string,
  spaceId: string,
  fields: StoredField[],
  extra: Partial<Record<'name' | 'details' | 'notes', string[]>> = {},
  listed = true,
): SearchDocument {
  const text: Record<'name' | 'details' | 'notes', string[]> = {
    name: [...(extra.name ?? [])],
    details: [...(extra.details ?? [])],
    notes: [],
  };
  for (const field of fields) text[COLUMN[field.f]].push(field.t);
  return {
    entityType,
    entityId,
    spaceId,
    listed,
    fields,
    name: foldText(text.name.join(' \n ')),
    details: foldText(text.details.join(' \n ')),
    notes: foldText(text.notes.join(' \n ')),
  };
}

interface Context {
  orgs: OrgIndex;
  definitions: Map<string, { label: string; type: string }>;
}

function customFields(
  db: Db,
  ctx: Context,
  targetIds: string[],
): Map<string, { label: string; value: string }[]> {
  const rows = targetIds.length
    ? db
        .select({
          targetId: fieldValues.targetId,
          definitionId: fieldValues.definitionId,
          value: fieldValues.value,
        })
        .from(fieldValues)
        .where(inArray(fieldValues.targetId, targetIds))
        .all()
    : [];
  const result = new Map<string, { label: string; value: string }[]>();
  for (const row of rows) {
    const definition = ctx.definitions.get(row.definitionId);
    // Yes/no values say nothing on their own.
    if (!definition || definition.type === 'boolean') continue;
    result.set(row.targetId, [
      ...(result.get(row.targetId) ?? []),
      { label: definition.label, value: row.value },
    ]);
  }
  return result;
}

function addressLine(a: typeof addresses.$inferSelect) {
  return [a.street, line(a.zip, a.city), a.region, a.country].filter((p) => p?.trim()).join(', ');
}

function entryFields(rows: (typeof entries.$inferSelect)[]): StoredField[] {
  return rows.flatMap((entry) => {
    const text = plainText(line(entry.title, entry.bodyMd));
    return text
      ? [
          {
            f: 'entry' as const,
            t: text,
            e: [entry.id, entry.kind, entry.occurredAt] as StoredField['e'],
          },
        ]
      : [];
  });
}

/** Search documents for these people; trashed or missing ones are left out. */
export function buildPersonDocuments(db: Db, ctx: Context, ids: string[]): SearchDocument[] {
  const docs: SearchDocument[] = [];
  for (const chunk of chunks(ids)) {
    const rows = db
      .select()
      .from(people)
      .where(and(inArray(people.id, chunk), notDeleted(people)))
      .all();
    if (!rows.length) continue;
    const live = rows.map((r) => r.id);

    const points = groupBy(
      db
        .select()
        .from(contactPoints)
        .where(and(inArray(contactPoints.personId, live), notDeleted(contactPoints)))
        .all(),
      (r) => r.personId,
    );
    const places = groupBy(
      db
        .select()
        .from(addresses)
        .where(and(inArray(addresses.personId, live), notDeleted(addresses)))
        .all(),
      (r) => r.personId!,
    );
    const links = groupBy(
      db
        .select()
        .from(affiliations)
        .where(and(inArray(affiliations.personId, live), notDeleted(affiliations)))
        .all(),
      (r) => r.personId,
    );
    const factRows = groupBy(
      db
        .select()
        .from(facts)
        .where(and(inArray(facts.personId, live), notDeleted(facts)))
        .all(),
      (r) => r.personId,
    );
    const tagRows = groupBy(
      db
        .select({ personId: personTags.personId, name: tags.name })
        .from(personTags)
        .innerJoin(tags, eq(tags.id, personTags.tagId))
        .where(and(inArray(personTags.personId, live), notDeleted(tags)))
        .all(),
      (r) => r.personId,
    );
    const entryRows = groupBy(
      db
        .select({ personId: entryPeople.personId, entry: entries })
        .from(entryPeople)
        .innerJoin(entries, eq(entries.id, entryPeople.entryId))
        .where(
          and(inArray(entryPeople.personId, live), notDeleted(entries), eq(entries.source, 'user')),
        )
        .orderBy(desc(entries.occurredAt))
        .all(),
      (r) => r.personId,
    );
    const fields = customFields(db, ctx, live);

    for (const person of rows) {
      // The display name includes the nickname; the birth name is searchable too.
      const name = line(personDisplayName(person), person.maidenName);
      const stored: StoredField[] = [];
      const extraDetails: string[] = [];
      if (name) stored.push({ f: 'name', t: name });
      if (person.summary) stored.push({ f: 'summary', t: person.summary });
      for (const affiliation of links.get(person.id) ?? []) {
        const path = ctx.orgs.path(affiliation.organizationId);
        if (path.length) stored.push({ f: 'organization', t: path.map((o) => o.name).join(' › ') });
        if (affiliation.role) stored.push({ f: 'role', t: affiliation.role });
      }
      for (const fact of factRows.get(person.id) ?? []) stored.push({ f: 'fact', t: fact.text });
      for (const tag of tagRows.get(person.id) ?? []) stored.push({ f: 'tag', t: `#${tag.name}` });
      for (const point of points.get(person.id) ?? []) {
        stored.push({ f: 'contact', t: point.value, ...(point.label ? { l: point.label } : {}) });
        // Phone numbers are also findable without spaces and dashes.
        if (point.kind === 'phone') extraDetails.push(point.value.replace(/\D/g, ''));
      }
      for (const address of places.get(person.id) ?? []) {
        const text = addressLine(address);
        if (text)
          stored.push({ f: 'address', t: text, ...(address.label ? { l: address.label } : {}) });
      }
      for (const field of fields.get(person.id) ?? [])
        stored.push({ f: 'field', t: field.value, l: field.label });
      const met = line(person.metWhere, person.metWhen);
      if (met) stored.push({ f: 'met', t: met });
      stored.push(...entryFields((entryRows.get(person.id) ?? []).map((r) => r.entry)));

      docs.push(
        toDocument(
          'person',
          person.id,
          person.spaceId,
          stored,
          { details: extraDetails },
          person.listed,
        ),
      );
    }
  }
  return docs;
}

/** Search documents for these organizations; trashed or missing ones are left out. */
export function buildOrganizationDocuments(db: Db, ctx: Context, ids: string[]): SearchDocument[] {
  const docs: SearchDocument[] = [];
  for (const chunk of chunks(ids)) {
    const rows = db
      .select()
      .from(organizations)
      .where(and(inArray(organizations.id, chunk), notDeleted(organizations)))
      .all();
    if (!rows.length) continue;
    const live = rows.map((r) => r.id);
    const places = groupBy(
      db
        .select()
        .from(addresses)
        .where(and(inArray(addresses.organizationId, live), notDeleted(addresses)))
        .all(),
      (r) => r.organizationId!,
    );
    const entryRows = groupBy(
      db
        .select()
        .from(entries)
        .where(
          and(
            inArray(entries.organizationId, live),
            notDeleted(entries),
            eq(entries.source, 'user'),
          ),
        )
        .orderBy(desc(entries.occurredAt))
        .all(),
      (r) => r.organizationId!,
    );
    const fields = customFields(db, ctx, live);

    for (const org of rows) {
      const stored: StoredField[] = [{ f: 'name', t: org.name }];
      const parents = ctx.orgs.path(org.id).slice(0, -1);
      if (parents.length)
        stored.push({ f: 'organization', t: parents.map((o) => o.name).join(' › ') });
      if (org.website) stored.push({ f: 'website', t: org.website });
      for (const address of places.get(org.id) ?? []) {
        const text = addressLine(address);
        if (text)
          stored.push({ f: 'address', t: text, ...(address.label ? { l: address.label } : {}) });
      }
      for (const field of fields.get(org.id) ?? [])
        stored.push({ f: 'field', t: field.value, l: field.label });
      if (org.notes) stored.push({ f: 'notes', t: plainText(org.notes) });
      stored.push(...entryFields(entryRows.get(org.id) ?? []));
      docs.push(toDocument('organization', org.id, org.spaceId, stored));
    }
  }
  return docs;
}

export function loadContext(db: Db, orgs: OrgIndex): Context {
  const definitions = new Map(
    db
      .select({
        id: fieldDefinitions.id,
        label: fieldDefinitions.label,
        type: fieldDefinitions.type,
      })
      .from(fieldDefinitions)
      .where(notDeleted(fieldDefinitions))
      .all()
      .map((d) => [d.id, d]),
  );
  return { orgs, definitions };
}
