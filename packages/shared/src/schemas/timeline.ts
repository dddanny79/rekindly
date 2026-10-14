import { z } from 'zod';
import { dateOnlySchema, idSchema, isoDateTimeSchema, optionalText } from './common';
import { personRefSchema } from './refs';

// Facts ------------------------------------------------------------------------------

export const factSchema = z.object({
  id: idSchema,
  text: z.string(),
  pinned: z.boolean(),
  sort: z.number().int(),
});
export type Fact = z.infer<typeof factSchema>;

const factText = z.string().trim().min(1).max(500);
export const createFactRequestSchema = z.object({ text: factText, pinned: z.boolean().optional() });
export const updateFactRequestSchema = z.object({
  text: factText.optional(),
  pinned: z.boolean().optional(),
});
export const reorderFactsRequestSchema = z.object({ ids: z.array(idSchema).max(500) });

// Questions for next time ---------------------------------------------------------------

/** An open question for the next conversation with a person. */
export const questionSchema = z.object({
  id: idSchema,
  text: z.string(),
  sort: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type Question = z.infer<typeof questionSchema>;

const questionText = z.string().trim().min(1).max(500);
export const createQuestionRequestSchema = z.object({ text: questionText });
export const updateQuestionRequestSchema = z.object({ text: questionText });
export const reorderQuestionsRequestSchema = z.object({ ids: z.array(idSchema).max(500) });
/** Marks a question as asked; with an answer, a note with question and answer is added. */
export const askQuestionRequestSchema = z.object({
  answer: z.string().trim().max(5000).optional(),
});

// Timeline entries --------------------------------------------------------------------

export const ENTRY_KINDS = ['note', 'call', 'meeting', 'message', 'event'] as const;
export const entryKindSchema = z.enum(ENTRY_KINDS);
export type EntryKind = z.infer<typeof entryKindSchema>;

/** Kinds that count as contact (“last contact”, contact rhythm). */
export const CONTACT_KINDS = ['call', 'meeting', 'message'] as const satisfies readonly EntryKind[];
/** Kinds that have a direction (incoming/outgoing). */
export const DIRECTED_KINDS = ['call', 'message'] as const satisfies readonly EntryKind[];

export const entryDirectionSchema = z.enum(['in', 'out']);
export type EntryDirection = z.infer<typeof entryDirectionSchema>;

export const entrySchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  kind: entryKindSchema,
  direction: entryDirectionSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  title: z.string().nullable(),
  bodyMd: z.string(),
  organization: z.object({ id: idSchema, name: z.string() }).nullable(),
  people: z.array(personRefSchema),
  /** `sync`: the app's log of a change from a CardDAV device (hidden by default). */
  source: z.enum(['user', 'sync']),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Entry = z.infer<typeof entrySchema>;

export const entryListResponseSchema = z.object({ entries: z.array(entrySchema) });

export const entriesQuerySchema = z.object({
  personId: idSchema.optional(),
  /** Entries of everyone linked to the organization or its sub-organizations. */
  organizationId: idSchema.optional(),
  spaceId: idSchema.optional(),
  /** Comma-separated kinds. */
  kinds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(entryKindSchema))
    .optional(),
  /** Only entries before this instant (paging). */
  before: isoDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type EntriesQuery = z.input<typeof entriesQuerySchema>;

const reminderInput = z.object({
  title: optionalText(200).optional(),
  dueOn: dateOnlySchema,
});

const directionRule = <T extends { kind?: EntryKind; direction?: EntryDirection | null }>(
  entry: T,
) => !entry.direction || !entry.kind || (DIRECTED_KINDS as readonly string[]).includes(entry.kind);

export const createEntryRequestSchema = z
  .object({
    kind: entryKindSchema,
    direction: entryDirectionSchema.nullable().optional(),
    /** Defaults to now. */
    occurredAt: isoDateTimeSchema.optional(),
    title: optionalText(200).optional(),
    bodyMd: z.string().max(20_000),
    /** The entry appears at all these people; the first one decides the space. */
    personIds: z.array(idSchema).min(1).max(50),
    organizationId: idSchema.nullable().optional(),
    /** Optional follow-up created together with the entry. */
    reminder: reminderInput.optional(),
  })
  .refine(directionRule, { path: ['direction'], message: 'direction_not_allowed' });

export const updateEntryRequestSchema = z
  .object({
    kind: entryKindSchema.optional(),
    direction: entryDirectionSchema.nullable().optional(),
    occurredAt: isoDateTimeSchema.optional(),
    title: optionalText(200).optional(),
    bodyMd: z.string().max(20_000).optional(),
    personIds: z.array(idSchema).min(1).max(50).optional(),
    organizationId: idSchema.nullable().optional(),
  })
  .refine(directionRule, { path: ['direction'], message: 'direction_not_allowed' });

// Reminders -------------------------------------------------------------------------

export const reminderSchema = z.object({
  id: idSchema,
  title: z.string(),
  /** Due date (`YYYY-MM-DD`, no time). */
  dueOn: z.string(),
  doneAt: isoDateTimeSchema.nullable(),
  entryId: idSchema.nullable(),
  person: personRefSchema.nullable(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const reminderListResponseSchema = z.object({ reminders: z.array(reminderSchema) });

export const remindersQuerySchema = z.object({
  personId: idSchema.optional(),
  status: z.enum(['open', 'done', 'all']).optional(),
});

export const createReminderRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueOn: dateOnlySchema,
});

export const updateReminderRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  dueOn: dateOnlySchema.optional(),
  done: z.boolean().optional(),
});

/** Most recent call/meeting/message with a person. */
export const lastContactSchema = z.object({
  entryId: idSchema,
  occurredAt: isoDateTimeSchema,
  kind: entryKindSchema,
  direction: entryDirectionSchema.nullable(),
  excerpt: z.string(),
});
export type LastContact = z.infer<typeof lastContactSchema>;

/** First meaningful line of a Markdown text, without markup, for previews. */
export function entryExcerpt(title: string | null, bodyMd: string, max = 140): string {
  const line =
    title ??
    bodyMd
      .split('\n')
      .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s+|\d+\.\s+)/, '').trim())
      .find(Boolean) ??
    '';
  const plain = line.replace(/[*_`~]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Answer to marking a question as asked: the note that was added, if any. */
export const askQuestionResponseSchema = z.object({ entry: entrySchema.nullable() });
