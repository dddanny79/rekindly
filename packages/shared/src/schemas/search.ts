import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';
import { personRefSchema } from './refs';
import { entryKindSchema } from './timeline';

/** Where a search hit matched, in ranking order (name first, timeline last). */
export const SEARCH_FIELDS = [
  'name',
  'role',
  'organization',
  'fact',
  'summary',
  'tag',
  'contact',
  'address',
  'field',
  'met',
  'website',
  'entry',
  'notes',
] as const;
export const searchFieldSchema = z.enum(SEARCH_FIELDS);
export type SearchField = z.infer<typeof searchFieldSchema>;

export const SEARCH_RESULT_TYPES = ['person', 'organization'] as const;
export const searchResultTypeSchema = z.enum(SEARCH_RESULT_TYPES);
export type SearchResultType = z.infer<typeof searchResultTypeSchema>;

export const searchMatchSchema = z.object({
  field: searchFieldSchema,
  /** Label of a custom field or contact point, if any. */
  label: z.string().nullable(),
  /** The timeline entry the text comes from (field `entry`). */
  entry: z
    .object({ id: idSchema, kind: entryKindSchema, occurredAt: isoDateTimeSchema })
    .nullable(),
  /** Excerpt of the matched text. */
  text: z.string(),
  /** `[start, end)` ranges in `text` to highlight. */
  highlights: z.array(z.tuple([z.number().int(), z.number().int()])),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

const organizationPathSchema = z.array(z.object({ id: idSchema, name: z.string() }));

export const searchResultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('person'),
    id: idSchema,
    spaceId: idSchema,
    person: personRefSchema,
    /** “Role @ Organization”, or the summary. */
    subtitle: z.string().nullable(),
    archived: z.boolean(),
    matches: z.array(searchMatchSchema),
  }),
  z.object({
    type: z.literal('organization'),
    id: idSchema,
    spaceId: idSchema,
    organization: z.object({
      id: idSchema,
      name: z.string(),
      kind: z.string().nullable(),
      path: organizationPathSchema,
    }),
    matches: z.array(searchMatchSchema),
  }),
]);
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchQuerySchema = z.object({
  q: z.string().max(200),
  spaceId: idSchema.optional(),
  type: searchResultTypeSchema.optional(),
  tagId: idSchema.optional(),
  /** People linked to this organization or below it, and those organizations. */
  organizationId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  /** More hits than `limit`. */
  hasMore: z.boolean(),
  /** Server time spent on the query, in milliseconds. */
  tookMs: z.number(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
