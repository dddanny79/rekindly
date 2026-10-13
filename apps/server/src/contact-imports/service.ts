import { and, desc, eq, isNull, or } from 'drizzle-orm';
import {
  type ContactImport,
  type ContactImportPreview,
  type CsvMapping,
  type ImportAction,
} from '@app/shared';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactImportItems,
  contactImports,
  contactPoints,
  davExtras,
  entries,
  entryPeople,
  facts,
  personDates,
  organizations,
  people,
  personTags,
  relationships,
  relationshipTypes,
  reminders,
  tags,
} from '../db/schema';
import { findTagByName } from '../catalog/tags';
import { addressKey, dateKey, ensureOrganizationPath } from '../dav/inbound';
import { createEntry } from '../entries/service';
import { removeFile, storePhoto } from '../files/service';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { touchPerson } from '../people/refs';
import { getLiveSpace } from '../spaces/service';
import {
  contactDetails,
  contactName,
  decodeText,
  type ImportBundle,
  type ImportContact,
  type RelationshipTypeRef,
} from './contact';
import { readCsv } from './csv';
import {
  contactKeys,
  Matcher,
  pointIdentity as pointKey,
  type Candidate,
  type MatchReason,
} from './match';
import { readVcards } from './vcf';
import { isMonicaExport, monicaBundle, readMonicaExport, type MonicaData } from './monica';
import { isMonicaApiFile } from './monica-api';

type Locale = 'en' | 'de';

export interface ImportFile {
  name: string | null;
  data: Buffer;
}

type CsvInfo = Omit<ReturnType<typeof readCsv>, 'contacts'>;
type ReadFile = ImportBundle & { format: 'vcard' | 'csv' | 'monica'; csv: CsvInfo | null };
const plain = (contacts: ImportContact[]) => ({ contacts, entries: [], relationships: [] });

/** Reads an uploaded file: vCard (.vcf), CSV, or Monica (export or fetched through its API). */
export function readImportFile(file: ImportFile, locale: Locale, mapping?: CsvMapping): ReadFile {
  const text = decodeText(file.data);
  if (/\.(vcf|vcard)$/i.test(file.name ?? '') || /^\s*BEGIN:VCARD/i.test(text)) {
    return { format: 'vcard', csv: null, ...plain(readVcards(text, locale)) };
  }
  if (/^\s*[{[]/.test(text)) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new DomainError(400, 'unsupported_import_format');
    }
    if (isMonicaExport(json)) {
      return { format: 'monica', csv: null, ...monicaBundle(readMonicaExport(json), locale) };
    }
    if (isMonicaApiFile(json)) {
      const data = (json as { data: MonicaData }).data;
      return { format: 'monica', csv: null, ...monicaBundle(data, locale) };
    }
    throw new DomainError(400, 'unsupported_import_format');
  }
  const { contacts, ...csv } = readCsv(text, locale, mapping);
  return { format: 'csv', csv, ...plain(contacts) };
}

interface Planned {
  contact: ImportContact;
  match: { candidate: Candidate; reasons: MatchReason[] } | null;
  action: ImportAction;
}

/**
 * Duplicate check for every contact; likely duplicates are skipped by default.
 * From Monica, a contact that already exists is completed instead, so its
 * timeline comes along.
 */
function plan(db: Db, contacts: ImportContact[], completeExisting = false): Planned[] {
  const matcher = Matcher.fromDb(db);
  return contacts.map((contact, index) => {
    const keys = contactKeys(contact);
    const match = matcher.find(keys);
    matcher.add(keys, {
      personId: null,
      organizationId: null,
      fileIndex: index,
      displayName: contactName(contact),
      spaceId: null,
    });
    const action: ImportAction = !match
      ? 'create'
      : completeExisting && match.candidate.personId && contact.kind === 'person'
        ? 'merge'
        : 'skip';
    return { contact, match, action };
  });
}

export function previewImport(
  db: Db,
  file: ImportFile,
  locale: Locale,
  mapping?: CsvMapping,
): ContactImportPreview {
  const read = readImportFile(file, locale, mapping);
  const monica = read.format === 'monica';
  return {
    format: read.format,
    fileName: file.name,
    csv: read.csv,
    extras: monica
      ? {
          entries: read.entries.length,
          reminders: read.contacts.reduce((n, c) => n + (c.reminders?.length ?? 0), 0),
          facts: read.contacts.reduce((n, c) => n + (c.facts?.length ?? 0), 0),
          relationships: read.relationships.length,
        }
      : null,
    contacts: plan(db, read.contacts, monica).map(({ contact, match, action }, index) => ({
      index,
      kind: contact.kind,
      indirect: contact.listed === false,
      displayName: contactName(contact),
      details: contactDetails(contact),
      match: match && {
        personId: match.candidate.personId,
        organizationId: match.candidate.organizationId,
        fileIndex: match.candidate.fileIndex,
        displayName: match.candidate.displayName,
        spaceId: match.candidate.spaceId,
        reasons: match.reasons,
      },
      action,
    })),
  };
}

// Writing ------------------------------------------------------------------------------

type Track = (table: string, rowId: string, fields?: Record<string, string>) => void;

/** A short one-line note is the person's “who is this”; anything longer a timeline note. */
function splitNote(note: string | null): { summary: string | null; long: string | null } {
  const text = note?.trim();
  if (!text) return { summary: null, long: null };
  return !text.includes('\n') && text.length <= 200
    ? { summary: text, long: null }
    : { summary: null, long: text };
}

function ensureTagTracked(db: Db, name: string, track: Track) {
  const existing = findTagByName(db, name);
  if (existing) return existing.id;
  const id = db.insert(tags).values({ name }).returning().get().id;
  track('tags', id);
  return id;
}

function addNoteEntry(db: Db, personId: string, text: string, track: Track) {
  const entry = createEntry(db, { kind: 'note', bodyMd: text, personIds: [personId] });
  track('entries', entry.id);
}

function createPerson(
  db: Db,
  spaceId: string,
  c: ImportContact,
  photoFileId: string | null,
  track: Track,
) {
  const note = splitNote(c.note);
  const person = db
    .insert(people)
    .values({
      spaceId,
      prefix: c.prefix,
      firstName: c.firstName,
      middleName: c.middleName,
      lastName: c.lastName,
      suffix: c.suffix,
      nickname: c.nickname,
      birthday: c.birthday,
      summary: note.summary ?? (c.organization.length ? null : c.title),
      favorite: c.favorite,
      photoFileId,
      listed: c.listed ?? true,
      archivedAt: c.archived ? nowIso() : null,
      contactEveryDays: c.contactEveryDays ?? null,
      contactRhythmSince: c.contactEveryDays ? nowIso() : null,
      metWhere: c.metWhere ?? null,
      metWhen: c.metWhen ?? null,
    })
    .returning()
    .get();
  track('people', person.id);
  addFactsAndReminders(db, person.id, c, track);
  c.points.forEach((p, sort) =>
    db
      .insert(contactPoints)
      .values({ personId: person.id, ...p, sort })
      .run(),
  );
  c.addresses.forEach((a, sort) =>
    db
      .insert(addresses)
      .values({ personId: person.id, ...a, sort })
      .run(),
  );
  if (c.organization.length) {
    const organizationId = ensureOrganizationPath(db, spaceId, c.organization, (id) =>
      track('organizations', id),
    );
    db.insert(affiliations)
      .values({ personId: person.id, organizationId, role: c.title, isPrimary: true })
      .run();
  }
  for (const name of c.tags) {
    const tagId = ensureTagTracked(db, name, track);
    db.insert(personTags).values({ personId: person.id, tagId }).onConflictDoNothing().run();
  }
  if (c.extraLines.length) {
    db.insert(davExtras)
      .values({ personId: person.id, lines: c.extraLines.join('\n') })
      .run();
  }
  if (note.long) addNoteEntry(db, person.id, note.long, track);
  return person.id;
}

function addFactsAndReminders(db: Db, personId: string, c: ImportContact, track: Track) {
  const known = new Set(
    db
      .select({ text: facts.text })
      .from(facts)
      .where(and(eq(facts.personId, personId), notDeleted(facts)))
      .all()
      .map((f) => f.text),
  );
  for (const [sort, text] of (c.facts ?? []).entries()) {
    if (known.has(text)) continue;
    track('facts', db.insert(facts).values({ personId, text, sort }).returning().get().id);
  }
  const knownDays = new Set(
    db
      .select()
      .from(personDates)
      .where(and(eq(personDates.personId, personId), notDeleted(personDates)))
      .all()
      .map(dateKey),
  );
  for (const day of c.dates) {
    if (knownDays.has(dateKey(day))) continue;
    knownDays.add(dateKey(day));
    track(
      'person_dates',
      db
        .insert(personDates)
        .values({ personId, ...day })
        .returning()
        .get().id,
    );
  }
  for (const r of c.reminders ?? []) {
    const row = db
      .insert(reminders)
      .values({ personId, title: r.title.slice(0, 200), dueAt: r.dueOn, recurrence: r.recurrence })
      .returning()
      .get();
    track('reminders', row.id);
  }
}

/** A company-only card: the organization, with its addresses and website. */
function createOrganization(db: Db, spaceId: string, c: ImportContact, track: Track) {
  let created = false;
  const id = ensureOrganizationPath(db, spaceId, c.organization, (orgId) => {
    created = true;
    track('organizations', orgId);
  });
  if (!created) return;
  const details = [
    c.note?.trim(),
    ...c.points
      .filter((p) => p.kind !== 'url')
      .map((p) => [p.label, p.value].filter(Boolean).join(': ')),
  ].filter(Boolean);
  db.update(organizations)
    .set({
      website: c.points.find((p) => p.kind === 'url')?.value ?? null,
      notes: details.length ? details.join('\n') : null,
    })
    .where(eq(organizations.id, id))
    .run();
  c.addresses.forEach((a, sort) =>
    db
      .insert(addresses)
      .values({ organizationId: id, ...a, sort })
      .run(),
  );
}

const FILLABLE = [
  'prefix',
  'middleName',
  'suffix',
  'nickname',
  'birthday',
  'summary',
  'metWhere',
  'metWhen',
] as const;

/** Adds what the existing person lacks; never overwrites a value. */
function mergeInto(
  db: Db,
  personId: string,
  c: ImportContact,
  photoFileId: string | null,
  track: Track,
) {
  const current = db.select().from(people).where(eq(people.id, personId)).get()!;
  const note = splitNote(c.note);
  const incoming: Record<(typeof FILLABLE)[number], string | null> = {
    prefix: c.prefix,
    middleName: c.middleName,
    suffix: c.suffix,
    nickname: c.nickname,
    birthday: c.birthday,
    summary: note.summary,
    metWhere: c.metWhere ?? null,
    metWhen: c.metWhen ?? null,
  };
  const fields: Record<string, string> = {};
  for (const key of FILLABLE) {
    const value = incoming[key];
    if (value && !current[key]) fields[key] = value;
  }
  if (photoFileId && !current.photoFileId) fields.photoFileId = photoFileId;
  if (c.contactEveryDays && !current.contactEveryDays) {
    fields.contactEveryDays = String(c.contactEveryDays);
    fields.contactRhythmSince = nowIso();
  }
  if (Object.keys(fields).length) {
    const set: Record<string, string | number> = { ...fields };
    if (fields.contactEveryDays) set.contactEveryDays = Number(fields.contactEveryDays);
    db.update(people).set(set).where(eq(people.id, personId)).run();
    track('people', personId, fields);
  }
  addFactsAndReminders(db, personId, c, track);

  const livePoints = db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.personId, personId), notDeleted(contactPoints)))
    .all();
  const knownPoints = new Set(livePoints.map(pointKey));
  let sort = livePoints.length;
  for (const p of c.points) {
    if (knownPoints.has(pointKey(p))) continue;
    knownPoints.add(pointKey(p));
    const row = db
      .insert(contactPoints)
      .values({ personId, ...p, isPrimary: false, sort: sort++ })
      .returning()
      .get();
    track('contact_points', row.id);
  }

  const livePlaces = db
    .select()
    .from(addresses)
    .where(and(eq(addresses.personId, personId), notDeleted(addresses)))
    .all();
  const knownPlaces = new Set(livePlaces.map(addressKey));
  for (const a of c.addresses) {
    if (knownPlaces.has(addressKey(a))) continue;
    knownPlaces.add(addressKey(a));
    const row = db
      .insert(addresses)
      .values({ personId, ...a, sort: sort++ })
      .returning()
      .get();
    track('addresses', row.id);
  }

  const hasAffiliation = db
    .select({ id: affiliations.id })
    .from(affiliations)
    .where(and(eq(affiliations.personId, personId), notDeleted(affiliations)))
    .get();
  if (c.organization.length && !hasAffiliation) {
    const organizationId = ensureOrganizationPath(db, current.spaceId, c.organization, (id) =>
      track('organizations', id),
    );
    const row = db
      .insert(affiliations)
      .values({ personId, organizationId, role: c.title, isPrimary: true })
      .returning()
      .get();
    track('affiliations', row.id);
  }

  for (const name of c.tags) {
    const tagId = ensureTagTracked(db, name, track);
    const added = db.insert(personTags).values({ personId, tagId }).onConflictDoNothing().run();
    if (added.changes) track('person_tags', `${personId}:${tagId}`);
  }

  // A note that did not become the summary goes to the timeline.
  const text = note.long ?? (note.summary && !fields.summary ? note.summary : null);
  if (text && text !== current.summary) addNoteEntry(db, personId, text, track);
  touchPerson(db, personId);
}

const toContactImport = (row: typeof contactImports.$inferSelect): ContactImport => ({
  id: row.id,
  format: row.format,
  fileName: row.fileName,
  spaceId: row.spaceId,
  created: row.createdCount,
  merged: row.mergedCount,
  skipped: row.skippedCount,
  createdAt: row.createdAt,
  undoneAt: row.undoneAt,
});

export interface ImportOptions {
  spaceId: string;
  mapping?: CsvMapping;
  /** Action per contact index; others keep the default from the preview. */
  actions: Record<string, ImportAction>;
}

/** Imports the file into a space; every created row is recorded for undo. */
export async function runImport(
  db: Db,
  dataDir: string,
  file: ImportFile,
  options: ImportOptions,
  locale: Locale,
): Promise<ContactImport> {
  const space = getLiveSpace(db, options.spaceId);
  const read = readImportFile(file, locale, options.mapping);
  const planned = plan(db, read.contacts, read.format === 'monica').map((p, index) => {
    let action = options.actions[String(index)] ?? p.action;
    // Only an existing person can be completed.
    if (action === 'merge' && !p.match?.candidate.personId) action = 'skip';
    if (action !== 'skip' && p.contact.kind === 'organization') action = 'create';
    return { ...p, action };
  });
  if (!planned.some((p) => p.action !== 'skip')) throw new DomainError(400, 'import_nothing');

  // Photos are files on disk: store them first, remove them again if the import fails.
  const photos = new Map<number, string>();
  for (const [index, p] of planned.entries()) {
    if (!p.contact.photo || p.action === 'skip') continue;
    if (p.action === 'merge') {
      const target = db
        .select()
        .from(people)
        .where(eq(people.id, p.match!.candidate.personId!))
        .get();
      if (target?.photoFileId) continue;
    }
    try {
      photos.set(index, (await storePhoto(db, dataDir, p.contact.photo)).id);
    } catch {
      // An unreadable photo must not stop the import.
    }
  }

  try {
    const row = db.transaction(() => {
      const record = db
        .insert(contactImports)
        .values({ format: read.format, fileName: file.name, spaceId: space.id })
        .returning()
        .get();
      const track: Track = (tableName, rowId, fields) =>
        db
          .insert(contactImportItems)
          .values({ importId: record.id, tableName, rowId, fields: fields ?? null })
          .onConflictDoNothing()
          .run();
      const counts = { create: 0, merge: 0, skip: 0 };
      // Source id → person, for timeline entries and relationships.
      const people = new Map<string, string>();
      const created = new Set<string>();
      for (const [index, p] of planned.entries()) {
        counts[p.action]++;
        const photo = photos.get(index) ?? null;
        let personId: string | null = null;
        if (p.action === 'create' && p.contact.kind === 'organization') {
          createOrganization(db, space.id, p.contact, track);
        } else if (p.action === 'create') {
          personId = createPerson(db, space.id, p.contact, photo, track);
          created.add(personId);
        } else if (p.action === 'merge') {
          personId = p.match!.candidate.personId!;
          mergeInto(db, personId, p.contact, photo, track);
        }
        if (personId && p.contact.sourceId) people.set(p.contact.sourceId, personId);
      }
      linkBundle(db, read, people, created, track);
      return db
        .update(contactImports)
        .set({ createdCount: counts.create, mergedCount: counts.merge, skippedCount: counts.skip })
        .where(eq(contactImports.id, record.id))
        .returning()
        .get();
    });
    return toContactImport(row);
  } catch (error) {
    for (const id of photos.values()) await removeFile(db, dataDir, id);
    throw error;
  }
}

/** “Met through”, timeline entries and relationships between the imported people. */
function linkBundle(
  db: Db,
  bundle: ImportBundle,
  ids: Map<string, string>,
  created: Set<string>,
  track: Track,
) {
  for (const c of bundle.contacts) {
    const personId = c.sourceId && ids.get(c.sourceId);
    const through = c.metThroughSourceId && ids.get(c.metThroughSourceId);
    if (!personId || !through || personId === through) continue;
    const current = db.select().from(people).where(eq(people.id, personId)).get();
    if (!current || current.metThroughPersonId) continue;
    db.update(people).set({ metThroughPersonId: through }).where(eq(people.id, personId)).run();
    if (!created.has(personId)) track('people', personId, { metThroughPersonId: through });
  }

  for (const e of bundle.entries) {
    const personIds = [
      ...new Set(e.people.map((id) => ids.get(id)).filter((id): id is string => !!id)),
    ];
    if (!personIds.length) continue;
    const first = db.select().from(people).where(eq(people.id, personIds[0]!)).get()!;
    // Importing the same file again does not double the timeline.
    const duplicate = db
      .select({ id: entries.id })
      .from(entries)
      .innerJoin(entryPeople, eq(entryPeople.entryId, entries.id))
      .where(
        and(
          eq(entryPeople.personId, first.id),
          eq(entries.kind, e.kind),
          eq(entries.occurredAt, e.occurredAt),
          eq(entries.bodyMd, e.bodyMd),
          isNull(entries.deletedAt),
        ),
      )
      .get();
    if (duplicate) continue;
    const row = db
      .insert(entries)
      .values({
        spaceId: first.spaceId,
        kind: e.kind,
        direction: e.direction,
        occurredAt: e.occurredAt,
        title: e.title?.slice(0, 200) ?? null,
        bodyMd: e.bodyMd,
      })
      .returning()
      .get();
    db.insert(entryPeople)
      .values(personIds.map((personId) => ({ entryId: row.id, personId })))
      .run();
    track('entries', row.id);
  }

  for (const r of bundle.relationships) {
    const from = ids.get(r.from);
    const to = ids.get(r.to);
    if (!from || !to || from === to) continue;
    const type = ensureRelationshipType(db, r.type, track);
    const existing = db
      .select({ id: relationships.id })
      .from(relationships)
      .where(
        and(
          eq(relationships.typeId, type.id),
          isNull(relationships.deletedAt),
          type.symmetric
            ? or(
                and(eq(relationships.fromPersonId, from), eq(relationships.toPersonId, to)),
                and(eq(relationships.fromPersonId, to), eq(relationships.toPersonId, from)),
              )
            : and(eq(relationships.fromPersonId, from), eq(relationships.toPersonId, to)),
        ),
      )
      .get();
    if (existing) continue;
    const row = db
      .insert(relationships)
      .values({ fromPersonId: from, toPersonId: to, typeId: type.id })
      .returning()
      .get();
    track('relationships', row.id);
  }
}

/** A seeded relationship type by key, or a custom one by name (created if missing). */
function ensureRelationshipType(db: Db, ref: RelationshipTypeRef, track: Track) {
  const live = db.select().from(relationshipTypes).where(isNull(relationshipTypes.deletedAt)).all();
  let custom: Exclude<RelationshipTypeRef, { key: string }>;
  if ('key' in ref) {
    const seeded = live.find((t) => t.nameKey === `seed.relationshipTypes.${ref.key}`);
    if (seeded) return seeded;
    // Renamed or deleted by the user: fall back to a custom type of that key.
    custom = { name: ref.key, reverseName: ref.key, symmetric: true };
  } else custom = ref;
  const lower = (v: string | null) => (v ?? '').toLowerCase();
  const found = live.find(
    (t) =>
      lower(t.name) === lower(custom.name) && lower(t.reverseName) === lower(custom.reverseName),
  );
  if (found) return found;
  const row = db
    .insert(relationshipTypes)
    .values({
      name: custom.name,
      reverseName: custom.reverseName,
      symmetric: custom.symmetric,
      sort: live.length,
    })
    .returning()
    .get();
  track('relationship_types', row.id);
  return row;
}

export function listImports(db: Db): ContactImport[] {
  return db
    .select()
    .from(contactImports)
    .orderBy(desc(contactImports.createdAt))
    .limit(50)
    .all()
    .map(toContactImport);
}

const TRASHABLE = {
  contact_points: contactPoints,
  addresses,
  affiliations,
  entries,
  facts,
  person_dates: personDates,
  reminders,
  relationships,
} as const;

/**
 * Undoes an import: the people, contact details, notes and organizations it
 * created go to the trash; fields it filled in on existing people are emptied
 * again (where nobody changed them since).
 */
export function undoImport(db: Db, id: string): ContactImport {
  const record = db.select().from(contactImports).where(eq(contactImports.id, id)).get();
  if (!record) throw notFound();
  if (record.undoneAt) throw new DomainError(409, 'import_already_undone');
  const items = db
    .select()
    .from(contactImportItems)
    .where(eq(contactImportItems.importId, id))
    .all();
  const now = nowIso();
  const row = db.transaction(() => {
    const touched = new Set<string>();
    for (const item of items) {
      if (item.tableName === 'people' && !item.fields) {
        db.update(people)
          .set({ deletedAt: now })
          .where(and(eq(people.id, item.rowId), isNull(people.deletedAt)))
          .run();
      } else if (item.tableName === 'people' && item.fields) {
        const current = db.select().from(people).where(eq(people.id, item.rowId)).get();
        if (!current) continue;
        const reset: Record<string, null> = {};
        for (const [key, value] of Object.entries(item.fields)) {
          if (current[key as keyof typeof current] === value) reset[key] = null;
        }
        if (Object.keys(reset).length)
          db.update(people).set(reset).where(eq(people.id, item.rowId)).run();
        touched.add(item.rowId);
      } else if (item.tableName === 'person_tags') {
        const [personId, tagId] = item.rowId.split(':') as [string, string];
        db.delete(personTags)
          .where(and(eq(personTags.personId, personId), eq(personTags.tagId, tagId)))
          .run();
        touched.add(personId);
      } else if (item.tableName in TRASHABLE) {
        const table = TRASHABLE[item.tableName as keyof typeof TRASHABLE];
        db.update(table)
          .set({ deletedAt: now })
          .where(and(eq(table.id, item.rowId), isNull(table.deletedAt)))
          .run();
      }
    }
    // Organizations and tags only if nobody else uses them by now.
    for (const item of items) {
      if (item.tableName === 'organizations') {
        const used = db
          .select({ id: affiliations.id })
          .from(affiliations)
          .innerJoin(people, eq(people.id, affiliations.personId))
          .where(
            and(
              eq(affiliations.organizationId, item.rowId),
              isNull(affiliations.deletedAt),
              isNull(people.deletedAt),
            ),
          )
          .get();
        const children = db
          .select({ id: organizations.id })
          .from(organizations)
          .where(and(eq(organizations.parentId, item.rowId), isNull(organizations.deletedAt)))
          .all()
          .filter(
            (child) => !items.some((i) => i.tableName === 'organizations' && i.rowId === child.id),
          );
        if (!used && !children.length) {
          db.update(organizations)
            .set({ deletedAt: now })
            .where(and(eq(organizations.id, item.rowId), isNull(organizations.deletedAt)))
            .run();
        }
      } else if (item.tableName === 'relationship_types') {
        const used = db
          .select({ id: relationships.id })
          .from(relationships)
          .where(and(eq(relationships.typeId, item.rowId), isNull(relationships.deletedAt)))
          .get();
        if (!used) {
          db.update(relationshipTypes)
            .set({ deletedAt: now })
            .where(and(eq(relationshipTypes.id, item.rowId), isNull(relationshipTypes.deletedAt)))
            .run();
        }
      } else if (item.tableName === 'tags') {
        const used = db
          .select({ id: personTags.personId })
          .from(personTags)
          .innerJoin(people, eq(people.id, personTags.personId))
          .where(and(eq(personTags.tagId, item.rowId), isNull(people.deletedAt)))
          .get();
        if (!used) {
          db.update(tags)
            .set({ deletedAt: now })
            .where(and(eq(tags.id, item.rowId), isNull(tags.deletedAt)))
            .run();
        }
      }
    }
    for (const personId of touched) touchPerson(db, personId);
    return db
      .update(contactImports)
      .set({ undoneAt: now })
      .where(eq(contactImports.id, id))
      .returning()
      .get();
  });
  return toContactImport(row);
}
