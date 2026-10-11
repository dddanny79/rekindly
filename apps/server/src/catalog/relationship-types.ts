import { and, asc, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  createRelationshipTypeRequestSchema,
  type RelationshipType,
  updateRelationshipTypeRequestSchema,
} from '@app/shared';
import type { Db } from '../db/client';
import { relationshipTypes } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { validate } from '../lib/validate';

type Row = typeof relationshipTypes.$inferSelect;

const toType = (row: Row): RelationshipType => ({
  id: row.id,
  name: row.name,
  reverseName: row.reverseName,
  nameKey: row.nameKey,
  reverseNameKey: row.reverseNameKey,
  symmetric: row.symmetric,
  sort: row.sort,
});

export function listRelationshipTypes(db: Db): RelationshipType[] {
  return db
    .select()
    .from(relationshipTypes)
    .where(notDeleted(relationshipTypes))
    .orderBy(asc(relationshipTypes.sort), asc(relationshipTypes.createdAt))
    .all()
    .map(toType);
}

export function getRelationshipType(db: Db, id: string, { includeDeleted = false } = {}) {
  return db
    .select()
    .from(relationshipTypes)
    .where(
      includeDeleted
        ? eq(relationshipTypes.id, id)
        : and(eq(relationshipTypes.id, id), notDeleted(relationshipTypes)),
    )
    .get();
}

export function relationshipTypeRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ relationshipTypes: listRelationshipTypes(db) }))
    .post('/', validate('json', createRelationshipTypeRequestSchema), (c) => {
      const { name, reverseName, symmetric } = c.req.valid('json');
      const sort = db.select({ n: count() }).from(relationshipTypes).get()!.n;
      const row = db
        .insert(relationshipTypes)
        .values({ name, reverseName: symmetric ? name : reverseName!, symmetric, sort })
        .returning()
        .get();
      return c.json(toType(row), 201);
    })
    .patch('/:id', validate('json', updateRelationshipTypeRequestSchema), (c) => {
      const current = getRelationshipType(db, c.req.param('id'));
      if (!current) throw notFound();
      const input = c.req.valid('json');
      // Renaming replaces the translated seed names with the user's own.
      const name = input.name ?? current.name;
      const reverseName = current.symmetric ? name : (input.reverseName ?? current.reverseName);
      const row = db
        .update(relationshipTypes)
        .set({
          ...(input.name ? { name, nameKey: null } : {}),
          ...(input.reverseName || (current.symmetric && input.name)
            ? { reverseName, reverseNameKey: null }
            : {}),
        })
        .where(eq(relationshipTypes.id, current.id))
        .returning()
        .get()!;
      return c.json(toType(row));
    })
    .delete('/:id', (c) => {
      // Existing relationships keep showing the (trashed) type's name.
      const res = db
        .update(relationshipTypes)
        .set({ deletedAt: nowIso() })
        .where(and(eq(relationshipTypes.id, c.req.param('id')), notDeleted(relationshipTypes)))
        .run();
      if (res.changes === 0) throw notFound();
      return c.body(null, 204);
    });
}
