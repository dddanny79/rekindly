import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createTagRequestSchema, type Tag, updateTagRequestSchema } from '@app/shared';
import type { Db } from '../db/client';
import { people, personTags, tags } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { validate } from '../lib/validate';

export function listTags(db: Db): Tag[] {
  const counts = new Map(
    db
      .select({ tagId: personTags.tagId, n: count() })
      .from(personTags)
      .innerJoin(people, eq(people.id, personTags.personId))
      .where(isNull(people.deletedAt))
      .groupBy(personTags.tagId)
      .all()
      .map((row) => [row.tagId, row.n]),
  );
  return db
    .select()
    .from(tags)
    .where(notDeleted(tags))
    .orderBy(asc(sql`lower(${tags.name})`))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      peopleCount: counts.get(row.id) ?? 0,
    }));
}

export function findTagByName(db: Db, name: string) {
  return db
    .select()
    .from(tags)
    .where(and(notDeleted(tags), sql`lower(${tags.name}) = lower(${name})`))
    .get();
}

/** Returns the live tag with this name (case-insensitive), creating it if needed. */
export function ensureTag(db: Db, name: string) {
  return findTagByName(db, name) ?? db.insert(tags).values({ name }).returning().get();
}

export function createTag(db: Db, name: string): Tag {
  if (findTagByName(db, name)) throw new DomainError(409, 'tag_exists');
  const row = db.insert(tags).values({ name }).returning().get();
  return { id: row.id, name: row.name, color: row.color, peopleCount: 0 };
}

export function renameTag(db: Db, id: string, name: string): Tag {
  const existing = findTagByName(db, name);
  if (existing && existing.id !== id) throw new DomainError(409, 'tag_exists');
  const row = db
    .update(tags)
    .set({ name })
    .where(and(eq(tags.id, id), notDeleted(tags)))
    .returning()
    .get();
  if (!row) throw notFound();
  return listTags(db).find((tag) => tag.id === id)!;
}

/** Soft delete; the links stay so the tag can be restored with its people. */
export function deleteTag(db: Db, id: string) {
  const res = db
    .update(tags)
    .set({ deletedAt: nowIso() })
    .where(and(eq(tags.id, id), notDeleted(tags)))
    .run();
  if (res.changes === 0) throw notFound();
}

export function tagsForPeople(db: Db, personIds: string[]) {
  const byPerson = new Map<string, { id: string; name: string; color: string | null }[]>();
  if (personIds.length === 0) return byPerson;
  const rows = db
    .select({ personId: personTags.personId, id: tags.id, name: tags.name, color: tags.color })
    .from(personTags)
    .innerJoin(tags, eq(tags.id, personTags.tagId))
    .where(and(inArray(personTags.personId, personIds), notDeleted(tags)))
    .orderBy(asc(sql`lower(${tags.name})`))
    .all();
  for (const { personId, ...tag } of rows) {
    byPerson.set(personId, [...(byPerson.get(personId) ?? []), tag]);
  }
  return byPerson;
}

export function tagRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ tags: listTags(db) }))
    .post('/', validate('json', createTagRequestSchema), (c) =>
      c.json(createTag(db, c.req.valid('json').name), 201),
    )
    .patch('/:id', validate('json', updateTagRequestSchema), (c) =>
      c.json(renameTag(db, c.req.param('id'), c.req.valid('json').name)),
    )
    .delete('/:id', (c) => {
      deleteTag(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
