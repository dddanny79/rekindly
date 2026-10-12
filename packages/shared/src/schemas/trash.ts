import { z } from 'zod';
import { idSchema, isoDateTimeSchema, labelRefSchema } from './common';
import { entryKindSchema } from './timeline';

/** Deleted data stays in the trash this long, then it is purged for good. */
export const TRASH_RETENTION_DAYS = 30;

export const TRASH_KINDS = [
  'person',
  'organization',
  'entry',
  'reminder',
  'fact',
  'contactPoint',
  'address',
  'affiliation',
  'relationship',
  'tag',
  'fieldDefinition',
  'relationshipType',
  'space',
] as const;
export const trashKindSchema = z.enum(TRASH_KINDS);
export type TrashKind = z.infer<typeof trashKindSchema>;

export const trashItemSchema = z.object({
  kind: trashKindSchema,
  id: idSchema,
  /** Main text; seeded spaces and relationship types carry an i18n key instead. */
  label: labelRefSchema,
  /** Second line: role, contact label, excerpt, … */
  detail: z.string().nullable(),
  /** Kind and time of a timeline entry. */
  entry: z.object({ kind: entryKindSchema, occurredAt: isoDateTimeSchema }).nullable(),
  /** Where it belonged. */
  owner: z
    .object({ type: z.enum(['person', 'organization']), id: idSchema, name: z.string() })
    .nullable(),
  spaceId: idSchema.nullable(),
  deletedAt: isoDateTimeSchema,
  /** When it will be purged automatically. */
  purgeAt: isoDateTimeSchema,
});
export type TrashItem = z.infer<typeof trashItemSchema>;

export const trashListResponseSchema = z.object({ items: z.array(trashItemSchema) });

export const emptyTrashResponseSchema = z.object({
  purged: z.number().int(),
  /** Items that cannot be purged yet (e.g. a relationship type still in use). */
  kept: z.number().int(),
});
