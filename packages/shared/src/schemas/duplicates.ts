import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';
import { MATCH_REASONS } from './contact-import';

/** One side of a likely duplicate pair, with enough to tell the two apart. */
export const duplicatePersonSchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  displayName: z.string(),
  initials: z.string(),
  photoUrl: z.string().nullable(),
  summary: z.string().nullable(),
  /** Main organization, first email or phone. */
  details: z.string().nullable(),
  listed: z.boolean(),
  archivedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type DuplicatePerson = z.infer<typeof duplicatePersonSchema>;

export const duplicatePairSchema = z.object({
  a: duplicatePersonSchema,
  b: duplicatePersonSchema,
  reasons: z.array(z.enum(MATCH_REASONS)),
});
export type DuplicatePair = z.infer<typeof duplicatePairSchema>;

export const duplicateListResponseSchema = z.object({ pairs: z.array(duplicatePairSchema) });

export const dismissDuplicateRequestSchema = z.object({
  personIds: z.tuple([idSchema, idSchema]),
});

/** Values that can be taken from the person that is merged in (names count as one). */
export const MERGE_FIELDS = [
  'name',
  'nickname',
  'maidenName',
  'pronouns',
  'birthday',
  'summary',
  'metWhere',
  'metWhen',
  'metThrough',
  'photo',
  'contactEveryDays',
  'space',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const mergePeopleRequestSchema = z.object({
  /** The person that stays. */
  keepId: idSchema,
  /** The person merged into it; goes to the trash afterwards. */
  mergeId: idSchema,
  /**
   * Values to take from the merged person where both have one. Empty values of
   * the kept person are always filled.
   */
  take: z.array(z.enum(MERGE_FIELDS)).default([]),
});
export type MergePeopleRequest = z.input<typeof mergePeopleRequestSchema>;
