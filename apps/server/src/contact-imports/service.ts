import { and, desc, eq, isNull } from 'drizzle-orm';
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
  organizations,
  people,
  personTags,
  tags,
} from '../db/schema';
import { findTagByName } from '../catalog/tags';
import { addressKey, ensureOrganizationPath, pointKey } from '../dav/inbound';
import { createEntry } from '../entries/service';
import { removeFile, storePhoto } from '../files/service';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { touchPerson } from '../people/refs';
import { getLiveSpace } from '../spaces/service';
import { contactDetails, contactName, decodeText, type ImportContact } from './contact';
import { readCsv } from './csv';
import { contactKeys, Matcher, type Candidate, type MatchReason } from './match';
import { readVcards } from './vcf';

type Locale = 'en' | 'de';

export interface ImportFile {
  name: string | null;
  data: Buffer;
}

/** Reads an uploaded file: vCard (.vcf) or CSV. */
export function readImportFile(file: ImportFile, locale: Locale, mapping?: CsvMapping) {
  const text = decodeText(file.data);
  if (/\.(vcf|vcard)$/i.test(file.name ?? '') || /^\s*BEGIN:VCARD/i.test(text)) {
    return { format: 'vcard' as const, contacts: readVcards(text, locale), csv: null };
  }
  if (/^\s*[{[]/.test(text)) throw new DomainError(400, 'unsupported_import_format');
  const { contacts, ...csv } = readCsv(text, locale, mapping);
  return { format: 'csv' as const, contacts, csv };
}

interface Planned {
  contact: ImportContact;
  match: { candidate: Candidate; reasons: MatchReason[] } | null;
  action: ImportAction;
}

/** Duplicate check for every contact; likely duplicates are skipped by default. */
function plan(db: Db, contacts: ImportContact[]): Planned[] {
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
    return { contact, match, action: match ? 'skip' : 'create' };
  });
}

export function previewImport(
  db: Db,
  file: ImportFile,
  locale: Locale,
  mapping?: CsvMapping,
): ContactImportPreview {
  const read = readImportFile(file, locale, mapping);
  return {
    format: read.format,
    fileName: file.name,
    csv: read.csv,
    contacts: plan(db, read.contacts).map(({ contact, match, action }, index) => ({
      index,
      kind: contact.kind,
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
    })
    .returning()
    .get();
  track('people', person.id);
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

const FILLABLE = ['prefix', 'middleName', 'suffix', 'nickname', 'birthday', 'summary'] as const;

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
  };
  const fields: Record<string, string> = {};
  for (const key of FILLABLE) {
    const value = incoming[key];
    if (value && !current[key]) fields[key] = value;
  }
  if (photoFileId && !current.photoFileId) fields.photoFileId = photoFileId;
  if (Object.keys(fields).length) {
    db.update(people).set(fields).where(eq(people.id, personId)).run();
    track('people', personId, fields);
  }

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
  const planned = plan(db, read.contacts).map((p, index) => {
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
      for (const [index, p] of planned.entries()) {
        counts[p.action]++;
        const photo = photos.get(index) ?? null;
        if (p.action === 'create' && p.contact.kind === 'organization') {
          createOrganization(db, space.id, p.contact, track);
        } else if (p.action === 'create') {
          createPerson(db, space.id, p.contact, photo, track);
        } else if (p.action === 'merge') {
          mergeInto(db, p.match!.candidate.personId!, p.contact, photo, track);
        }
      }
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

export function listImports(db: Db): ContactImport[] {
  return db
    .select()
    .from(contactImports)
    .orderBy(desc(contactImports.createdAt))
    .limit(50)
    .all()
    .map(toContactImport);
}

const TRASHABLE = { contact_points: contactPoints, addresses, affiliations, entries } as const;

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
