import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  addresses,
  affiliations,
  contactPoints,
  davExtras,
  files,
  organizations,
  people,
} from '../db/schema';
import { createEntry } from '../entries/service';
import { removeFile, storePhoto } from '../files/service';
import { notDeleted, nowIso } from '../lib/sql';
import { OrgIndex } from '../organizations';
import { mainAffiliation } from '../people/service';
import { touchPerson } from '../people/refs';
import type { CardAddress, CardPoint, ParsedCard } from './vcard';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Locale = 'en' | 'de';

const TEXT: Record<Locale, Record<string, string>> = {
  en: {
    created: 'Added via sync',
    changed: 'Changed via sync',
    name: 'Name changed',
    nickname: 'Nickname changed',
    birthday: 'Birthday changed',
    summary: '“Who is this” changed',
    photo: 'Photo changed',
    phone: 'Phone',
    email: 'Email',
    url: 'Website',
    messenger: 'Messenger',
    social: 'Social profile',
    address: 'Address',
    added: '{{what}} added: {{value}}',
    removed: '{{what}} moved to the trash: {{value}}',
    organization: 'Organization: {{value}}',
    role: 'Role: {{value}}',
    orgKept: 'Organization removed on the device; kept here: {{value}}',
  },
  de: {
    created: 'Über Sync angelegt',
    changed: 'Über Sync geändert',
    name: 'Name geändert',
    nickname: 'Spitzname geändert',
    birthday: 'Geburtstag geändert',
    summary: '„Wer ist das“ geändert',
    photo: 'Foto geändert',
    phone: 'Telefon',
    email: 'E-Mail',
    url: 'Website',
    messenger: 'Messenger',
    social: 'Soziales Profil',
    address: 'Adresse',
    added: '{{what}} hinzugefügt: {{value}}',
    removed: '{{what}} in den Papierkorb: {{value}}',
    organization: 'Organisation: {{value}}',
    role: 'Rolle: {{value}}',
    orgKept: 'Organisation am Gerät entfernt, hier behalten: {{value}}',
  },
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');

export const pointKey = (p: { kind: string; value: string }) =>
  `${p.kind}|${p.kind === 'phone' ? p.value.replace(/[^\d+]/g, '') : p.value.trim().toLowerCase()}`;

export const addressKey = (a: Omit<CardAddress, 'label'>) =>
  [a.street, a.zip, a.city, a.region, a.country]
    .map((p) => (p ?? '').trim().toLowerCase())
    .join('|');

const addressText = (a: Omit<CardAddress, 'label'>) =>
  [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.region, a.country]
    .filter((p) => p?.trim())
    .join(', ');

/**
 * Finds or creates the organization path (top-level first) in the space;
 * `onCreate` hears about every organization that had to be created.
 */
export function ensureOrganizationPath(
  db: Db,
  spaceId: string,
  names: string[],
  onCreate?: (id: string) => void,
): string {
  let parentId: string | null = null;
  for (const [index, name] of names.entries()) {
    const candidates = db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.spaceId, spaceId),
          notDeleted(organizations),
          sql`lower(${organizations.name}) = lower(${name})`,
        ),
      )
      .all();
    const match: (typeof candidates)[number] | undefined =
      candidates.find((o) => o.parentId === parentId) ?? (index === 0 ? candidates[0] : undefined);
    if (match) parentId = match.id;
    else {
      parentId = db
        .insert(organizations)
        .values({ spaceId, name, parentId, kind: index === 0 ? 'company' : null })
        .returning()
        .get().id;
      onCreate?.(parentId);
    }
  }
  return parentId!;
}

async function samePhoto(db: Db, dataDir: string, fileId: string | null, photo: Buffer) {
  if (!fileId) return false;
  const row = db.select().from(files).where(eq(files.id, fileId)).get();
  if (!row) return false;
  try {
    const stored = await readFile(join(dataDir, 'files', row.path));
    return (
      createHash('sha256').update(stored).digest('hex') ===
      createHash('sha256').update(photo).digest('hex')
    );
  } catch {
    return false;
  }
}

export interface ApplyOptions {
  /** Existing person, or undefined to create one in `spaceId`. */
  personId?: string;
  spaceId: string;
  card: ParsedCard;
  locale: Locale;
  dataDir: string;
  /** SHA-256 of the photo this client sent last time (see `dav_cards`). */
  knownPhotoHash?: string | null;
}

export const photoHash = (photo: Buffer) => createHash('sha256').update(photo).digest('hex');

/**
 * Merges a vCard from a client into the app. Defensive: removed contact details
 * go to the trash, organizations are never removed, an absent photo is kept.
 * Every change is logged as a timeline entry. Returns the person id.
 */
export async function applyCard(db: Db, options: ApplyOptions): Promise<string> {
  const { card, locale } = options;
  const t = TEXT[locale];
  const changes: string[] = [];

  // Names: something is always needed; company-only cards use the company.
  const names = {
    prefix: card.prefix,
    firstName: card.firstName,
    middleName: card.middleName,
    lastName: card.lastName,
    suffix: card.suffix,
  };
  if (!names.firstName && !names.lastName && !card.nickname) {
    names.firstName = card.organization.at(-1) ?? '?';
  }
  const fields = {
    ...names,
    nickname: card.nickname,
    birthday: card.birthday,
    summary: card.note,
  };

  // The photo is stored first (it is async); everything else is one transaction,
  // so a failure never leaves a half-applied card behind.
  const before = options.personId
    ? db.select().from(people).where(eq(people.id, options.personId)).get()
    : undefined;
  let newPhoto: { id: string } | null = null;
  if (
    card.photo &&
    photoHash(card.photo) !== options.knownPhotoHash &&
    !(await samePhoto(db, options.dataDir, before?.photoFileId ?? null, card.photo))
  ) {
    try {
      newPhoto = await storePhoto(db, options.dataDir, card.photo);
    } catch {
      // An unreadable photo must not lose the rest of the card.
    }
  }

  let id: string;
  try {
    id = db.transaction(() => {
      let personId = options.personId;
      const isNew = !personId;
      if (!personId) {
        personId = db
          .insert(people)
          .values({ spaceId: options.spaceId, ...fields })
          .returning()
          .get().id;
      } else {
        const current = db.select().from(people).where(eq(people.id, personId)).get()!;
        const nameChanged = (Object.keys(names) as (keyof typeof names)[]).some(
          (k) => (current[k] ?? null) !== (names[k] ?? null),
        );
        if (nameChanged) changes.push(t.name!);
        if ((current.nickname ?? null) !== (card.nickname ?? null)) changes.push(t.nickname!);
        if ((current.birthday ?? null) !== (card.birthday ?? null)) changes.push(t.birthday!);
        if ((current.summary ?? null) !== (card.note ?? null)) changes.push(t.summary!);
        if (changes.length) {
          db.update(people)
            .set({ ...fields, updatedAt: nowIso() })
            .where(eq(people.id, personId))
            .run();
        }
      }
      const person = db.select().from(people).where(eq(people.id, personId)).get()!;

      // Contact points: add new ones, trash removed ones, update labels.
      const livePoints = db
        .select()
        .from(contactPoints)
        .where(and(eq(contactPoints.personId, personId), notDeleted(contactPoints)))
        .all();
      const incoming = new Map<string, CardPoint>(card.points.map((p) => [pointKey(p), p]));
      for (const point of livePoints) {
        const match = incoming.get(pointKey(point));
        if (!match) {
          db.update(contactPoints)
            .set({ deletedAt: nowIso() })
            .where(eq(contactPoints.id, point.id))
            .run();
          if (!isNew) changes.push(fill(t.removed!, { what: t[point.kind]!, value: point.value }));
        } else if ((match.label ?? null) !== point.label || match.isPrimary !== point.isPrimary) {
          db.update(contactPoints)
            .set({ label: match.label, isPrimary: match.isPrimary })
            .where(eq(contactPoints.id, point.id))
            .run();
        }
        incoming.delete(pointKey(point));
      }
      let sort = livePoints.length;
      for (const point of incoming.values()) {
        db.insert(contactPoints)
          .values({ personId, ...point, sort: sort++ })
          .run();
        if (!isNew) changes.push(fill(t.added!, { what: t[point.kind]!, value: point.value }));
      }

      // Addresses, the same way.
      const livePlaces = db
        .select()
        .from(addresses)
        .where(and(eq(addresses.personId, personId), notDeleted(addresses)))
        .all();
      const incomingPlaces = new Map(card.addresses.map((a) => [addressKey(a), a]));
      for (const place of livePlaces) {
        const match = incomingPlaces.get(addressKey(place));
        if (!match) {
          db.update(addresses).set({ deletedAt: nowIso() }).where(eq(addresses.id, place.id)).run();
          if (!isNew)
            changes.push(fill(t.removed!, { what: t.address!, value: addressText(place) }));
        } else if ((match.label ?? null) !== place.label) {
          db.update(addresses).set({ label: match.label }).where(eq(addresses.id, place.id)).run();
        }
        incomingPlaces.delete(addressKey(place));
      }
      for (const place of incomingPlaces.values()) {
        db.insert(addresses)
          .values({ personId, ...place })
          .run();
        if (!isNew) changes.push(fill(t.added!, { what: t.address!, value: addressText(place) }));
      }

      // Organization and role of the main affiliation.
      const orgs = OrgIndex.load(db);
      const links = db
        .select()
        .from(affiliations)
        .where(and(eq(affiliations.personId, personId), notDeleted(affiliations)))
        .all()
        .filter((a) => orgs.byId.has(a.organizationId));
      const main = mainAffiliation(links);
      const currentPath = main ? orgs.path(main.organizationId).map((o) => o.name) : [];
      const samePath =
        currentPath.length === card.organization.length &&
        currentPath.every((name, i) => name.toLowerCase() === card.organization[i]!.toLowerCase());
      if (card.organization.length && !samePath) {
        const orgId = ensureOrganizationPath(db, person.spaceId, card.organization);
        const existing = links.find((a) => a.organizationId === orgId && !a.endedOn);
        db.update(affiliations)
          .set({ isPrimary: false })
          .where(and(eq(affiliations.personId, personId), isNull(affiliations.deletedAt)))
          .run();
        if (existing) {
          db.update(affiliations)
            .set({ isPrimary: true, role: card.title })
            .where(eq(affiliations.id, existing.id))
            .run();
        } else {
          db.insert(affiliations)
            .values({ personId, organizationId: orgId, role: card.title, isPrimary: true })
            .run();
        }
        if (!isNew) changes.push(fill(t.organization!, { value: card.organization.join(' › ') }));
      } else if (main && samePath && (main.role ?? null) !== (card.title ?? null)) {
        db.update(affiliations).set({ role: card.title }).where(eq(affiliations.id, main.id)).run();
        changes.push(fill(t.role!, { value: card.title ?? '–' }));
      } else if (!card.organization.length && main && !isNew) {
        // Never delete an affiliation from a sync; the card shows it again.
        changes.push(fill(t.orgKept!, { value: currentPath.join(' › ') }));
      }

      if (newPhoto) {
        db.update(people).set({ photoFileId: newPhoto.id }).where(eq(people.id, personId)).run();
        if (!isNew) changes.push(t.photo!);
      }

      // Lines the app has no field for are written back unchanged.
      if (card.extraLines.length) {
        const lines = card.extraLines.join('\n');
        db.insert(davExtras)
          .values({ personId, lines })
          .onConflictDoUpdate({ target: davExtras.personId, set: { lines, updatedAt: nowIso() } })
          .run();
      } else {
        db.delete(davExtras).where(eq(davExtras.personId, personId)).run();
      }

      touchPerson(db, personId);
      if (isNew || changes.length) {
        createEntry(
          db,
          {
            kind: 'note',
            title: isNew ? t.created! : t.changed!,
            bodyMd: changes.length ? changes.map((c) => `- ${c}`).join('\n') : (t.created ?? ''),
            personIds: [personId],
          },
          'sync',
        );
      }
      return personId;
    });
  } catch (error) {
    if (newPhoto) await removeFile(db, options.dataDir, newPhoto.id);
    throw error;
  }
  if (newPhoto && before?.photoFileId) await removeFile(db, options.dataDir, before.photoFileId);
  return id;
}
