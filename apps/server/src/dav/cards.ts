import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { addresses, affiliations, contactPoints, davCards, davExtras, people } from '../db/schema';
import { notDeleted } from '../lib/sql';
import type { OrgIndex } from '../organizations';
import { mainAffiliation } from '../people/service';
import { buildVcard, type CardData } from './vcard';

type PersonRow = typeof people.$inferSelect;
type CardRow = typeof davCards.$inferSelect;

/** Only contacts are synced: no indirect contacts, nothing archived or trashed. */
export const isSynced = (p: PersonRow | undefined): p is PersonRow =>
  !!p && !p.deletedAt && !p.archivedAt && p.listed;

function chunks<T>(list: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
}

const group = <T, K>(rows: T[], key: (row: T) => K) => {
  const map = new Map<K, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};

/** The app's data of these people in vCard terms (synced people only). */
export function cardData(db: Db, orgs: OrgIndex, rows: PersonRow[]): Map<string, CardData> {
  const ids = rows.map((r) => r.id);
  const result = new Map<string, CardData>();
  if (!ids.length) return result;
  const points = group(
    db
      .select()
      .from(contactPoints)
      .where(and(inArray(contactPoints.personId, ids), notDeleted(contactPoints)))
      .orderBy(asc(contactPoints.sort), asc(contactPoints.createdAt))
      .all(),
    (r) => r.personId,
  );
  const places = group(
    db
      .select()
      .from(addresses)
      .where(and(inArray(addresses.personId, ids), notDeleted(addresses)))
      .orderBy(asc(addresses.sort), asc(addresses.createdAt))
      .all(),
    (r) => r.personId!,
  );
  const links = group(
    db
      .select()
      .from(affiliations)
      .where(and(inArray(affiliations.personId, ids), notDeleted(affiliations)))
      .all()
      .filter((a) => orgs.byId.has(a.organizationId)),
    (r) => r.personId,
  );
  for (const p of rows) {
    const main = mainAffiliation(links.get(p.id) ?? []);
    result.set(p.id, {
      uid: p.id,
      prefix: p.prefix,
      firstName: p.firstName,
      middleName: p.middleName,
      lastName: p.lastName,
      suffix: p.suffix,
      nickname: p.nickname,
      birthday: p.birthday,
      organization: main ? orgs.path(main.organizationId).map((o) => o.name) : [],
      title: main?.role ?? null,
      note: p.summary,
      points: (points.get(p.id) ?? []).map((c) => ({
        kind: c.kind,
        label: c.label,
        value: c.value,
        isPrimary: c.isPrimary,
      })),
      addresses: (places.get(p.id) ?? []).map((a) => ({
        label: a.label,
        street: a.street,
        zip: a.zip,
        city: a.city,
        region: a.region,
        country: a.country,
      })),
    });
  }
  return result;
}

export const extraLinesOf = (text: string | undefined) =>
  text ? text.split('\n').filter(Boolean) : [];

/**
 * Rebuilds the stored vCards of these people (called with the search index
 * flush). A card whose content changed gets the next sequence number; people who
 * are no longer synced become tombstones.
 */
export function rebuildCards(db: Db, orgs: OrgIndex, personIds: string[]) {
  if (!personIds.length) return;
  let seq =
    db
      .select({ max: sql<number | null>`max(${davCards.seq})` })
      .from(davCards)
      .get()?.max ?? 0;
  for (const chunk of chunks([...new Set(personIds)])) {
    const rows = new Map(
      db
        .select()
        .from(people)
        .where(inArray(people.id, chunk))
        .all()
        .map((r) => [r.id, r]),
    );
    const existing = new Map<string, CardRow>(
      db
        .select()
        .from(davCards)
        .where(inArray(davCards.personId, chunk))
        .all()
        .map((r) => [r.personId, r]),
    );
    const extras = new Map(
      db
        .select()
        .from(davExtras)
        .where(inArray(davExtras.personId, chunk))
        .all()
        .map((r) => [r.personId, r.lines]),
    );
    const synced = [...rows.values()].filter(isSynced);
    const data = cardData(db, orgs, synced);

    for (const id of chunk) {
      const person = rows.get(id);
      const card = existing.get(id);
      if (!isSynced(person)) {
        if (card && !card.deleted) {
          db.update(davCards)
            .set({ deleted: true, seq: ++seq })
            .where(eq(davCards.personId, id))
            .run();
        }
        continue;
      }
      const uid = card?.uid ?? id;
      const vcard = buildVcard(
        { ...data.get(id)!, uid },
        { extraLines: extraLinesOf(extras.get(id)) },
      );
      const etag = createHash('sha1')
        .update(vcard)
        .update(person.photoFileId ?? '')
        .digest('hex')
        .slice(0, 20);
      if (card && !card.deleted && card.etag === etag && card.spaceId === person.spaceId) continue;
      const values = {
        spaceId: person.spaceId,
        etag,
        vcard,
        photoFileId: person.photoFileId,
        // A photo changed in the app: what a client sent before no longer counts.
        ...(card && card.photoFileId !== person.photoFileId ? { clientPhotoHash: null } : {}),
        seq: ++seq,
        deleted: false,
      };
      db.insert(davCards)
        .values({ personId: id, name: id, uid, ...values })
        .onConflictDoUpdate({ target: davCards.personId, set: values })
        .run();
    }
  }
}
