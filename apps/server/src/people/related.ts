import { and, asc, inArray, or } from 'drizzle-orm';
import type { RelatedTo } from '@app/shared';
import type { Db } from '../db/client';
import { relationships, relationshipTypes } from '../db/schema';
import { notDeleted } from '../lib/sql';
import { livePeopleByIds, toPersonRef } from './refs';

/**
 * For indirect contacts: the contact they are known through, with the relationship
 * from their side (“Lea is Kind of Jana”). The oldest relationship to a live
 * contact wins. People without one are missing from the map.
 */
export function relatedToFor(db: Db, personIds: string[]): Map<string, RelatedTo> {
  const result = new Map<string, RelatedTo>();
  if (!personIds.length) return result;
  const rows = db
    .select()
    .from(relationships)
    .where(
      and(
        or(
          inArray(relationships.fromPersonId, personIds),
          inArray(relationships.toPersonId, personIds),
        ),
        notDeleted(relationships),
      ),
    )
    .orderBy(asc(relationships.createdAt))
    .all();
  if (!rows.length) return result;
  const others = livePeopleByIds(
    db,
    rows.flatMap((r) => [r.fromPersonId, r.toPersonId]),
  );
  const types = new Map(
    db
      .select()
      .from(relationshipTypes)
      .where(
        inArray(
          relationshipTypes.id,
          rows.map((r) => r.typeId),
        ),
      )
      .all()
      .map((t) => [t.id, t]),
  );
  const wanted = new Set(personIds);
  for (const row of rows) {
    const type = types.get(row.typeId);
    if (!type) continue;
    // `to` is `type.name` of `from`; `from` is `type.reverseName` of `to`.
    const sides = [
      { self: row.toPersonId, other: row.fromPersonId, name: type.name, key: type.nameKey },
      {
        self: row.fromPersonId,
        other: row.toPersonId,
        name: type.reverseName,
        key: type.reverseNameKey,
      },
    ];
    for (const side of sides) {
      if (!wanted.has(side.self) || result.has(side.self)) continue;
      const other = others.get(side.other);
      if (!other || !other.listed) continue;
      result.set(side.self, {
        label: { name: side.name, nameKey: side.key },
        person: toPersonRef(other),
      });
    }
  }
  return result;
}
