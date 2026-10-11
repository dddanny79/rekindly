import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  createFieldDefinitionRequestSchema,
  type FieldDefinition,
  fieldTargetSchema,
  type FieldValue,
  normalizeFieldValue,
  updateFieldDefinitionRequestSchema,
} from '@app/shared';
import { z } from 'zod';
import type { Db } from '../db/client';
import { fieldDefinitions, fieldValues } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { DomainError, notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { validate } from '../lib/validate';

type Row = typeof fieldDefinitions.$inferSelect;
type Target = FieldDefinition['target'];

const toDefinition = (row: Row): FieldDefinition => ({
  id: row.id,
  target: row.target,
  key: row.key,
  label: row.label,
  type: row.type,
  options: row.options ?? null,
  sort: row.sort,
});

export function listFieldDefinitions(db: Db, target?: Target): FieldDefinition[] {
  return db
    .select()
    .from(fieldDefinitions)
    .where(
      target
        ? and(notDeleted(fieldDefinitions), eq(fieldDefinitions.target, target))
        : notDeleted(fieldDefinitions),
    )
    .orderBy(asc(fieldDefinitions.sort), asc(fieldDefinitions.createdAt))
    .all()
    .map(toDefinition);
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'field';

/** Values of live definitions for the given targets. */
export function fieldValuesFor(db: Db, targetIds: string[]): Map<string, FieldValue[]> {
  const byTarget = new Map<string, FieldValue[]>();
  if (targetIds.length === 0) return byTarget;
  const rows = db
    .select({
      targetId: fieldValues.targetId,
      definitionId: fieldValues.definitionId,
      value: fieldValues.value,
    })
    .from(fieldValues)
    .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, fieldValues.definitionId))
    .where(and(inArray(fieldValues.targetId, targetIds), notDeleted(fieldDefinitions)))
    .all();
  for (const { targetId, ...value } of rows) {
    byTarget.set(targetId, [...(byTarget.get(targetId) ?? []), value]);
  }
  return byTarget;
}

/** Sets (or, with an empty value, clears) a custom field of a person or organization. */
export function setFieldValue(
  db: Db,
  target: Target,
  targetId: string,
  definitionId: string,
  raw: string,
) {
  const definition = db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.id, definitionId), notDeleted(fieldDefinitions)))
    .get();
  if (!definition || definition.target !== target) throw new DomainError(400, 'unknown_field');
  const where = and(eq(fieldValues.definitionId, definitionId), eq(fieldValues.targetId, targetId));
  if (raw.trim() === '') {
    db.delete(fieldValues).where(where).run();
    return null;
  }
  const value = normalizeFieldValue(toDefinition(definition), raw);
  if (value === null) throw new DomainError(400, 'invalid_field_value');
  db.insert(fieldValues)
    .values({ definitionId, targetId, value })
    .onConflictDoUpdate({
      target: [fieldValues.definitionId, fieldValues.targetId],
      set: { value },
    })
    .run();
  return { definitionId, value };
}

export function fieldRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get('/', validate('query', z.object({ target: fieldTargetSchema.optional() })), (c) =>
      c.json({ fieldDefinitions: listFieldDefinitions(db, c.req.valid('query').target) }),
    )
    .post('/', validate('json', createFieldDefinitionRequestSchema), (c) => {
      const input = c.req.valid('json');
      const taken = new Set(
        db
          .select({ key: fieldDefinitions.key })
          .from(fieldDefinitions)
          .where(eq(fieldDefinitions.target, input.target))
          .all()
          .map((row) => row.key),
      );
      let key = slug(input.label);
      for (let i = 2; taken.has(key); i++) key = `${slug(input.label)}_${i}`;
      const sort = db.select({ n: count() }).from(fieldDefinitions).get()!.n;
      const row = db
        .insert(fieldDefinitions)
        .values({
          target: input.target,
          key,
          label: input.label,
          type: input.type,
          options: input.type === 'select' ? input.options! : null,
          sort,
        })
        .returning()
        .get();
      return c.json(toDefinition(row), 201);
    })
    .patch('/:id', validate('json', updateFieldDefinitionRequestSchema), (c) => {
      const input = c.req.valid('json');
      const current = db
        .select()
        .from(fieldDefinitions)
        .where(and(eq(fieldDefinitions.id, c.req.param('id')), notDeleted(fieldDefinitions)))
        .get();
      if (!current) throw notFound();
      if (input.options && current.type !== 'select')
        throw new DomainError(400, 'options_not_allowed');
      const row = db
        .update(fieldDefinitions)
        .set(input)
        .where(eq(fieldDefinitions.id, current.id))
        .returning()
        .get()!;
      return c.json(toDefinition(row));
    })
    .delete('/:id', (c) => {
      const res = db
        .update(fieldDefinitions)
        .set({ deletedAt: nowIso() })
        .where(and(eq(fieldDefinitions.id, c.req.param('id')), notDeleted(fieldDefinitions)))
        .run();
      if (res.changes === 0) throw notFound();
      return c.body(null, 204);
    });
}
