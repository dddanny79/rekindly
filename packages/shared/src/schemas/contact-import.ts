import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

export const CONTACT_IMPORT_FORMATS = ['vcard', 'csv', 'monica'] as const;
export type ContactImportFormat = (typeof CONTACT_IMPORT_FORMATS)[number];

/** What a CSV column holds. Columns of one `group` form one phone/email/address. */
export const CSV_FIELDS = [
  'fullName',
  'prefix',
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'nickname',
  'birthday',
  'note',
  'organization',
  'department',
  'title',
  'tags',
  'email',
  'phone',
  'url',
  'street',
  'zip',
  'city',
  'region',
  'country',
  'label',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export const csvColumnSchema = z
  .object({
    field: z.enum(CSV_FIELDS),
    /** Columns with the same group belong together (e.g. "Phone 1 - Label" + "- Value"). */
    group: z.string().max(100).nullish(),
    /** Fixed label for the point or address, e.g. "Mobile" for "Mobile Phone". */
    label: z.string().max(100).nullish(),
  })
  .nullable();
export type CsvColumn = z.infer<typeof csvColumnSchema>;

/** One entry per CSV column; null = ignore the column. */
export const csvMappingSchema = z.array(csvColumnSchema).max(500);
export type CsvMapping = z.infer<typeof csvMappingSchema>;

export const CSV_TEMPLATES = ['google', 'outlook', 'generic'] as const;

export const IMPORT_ACTIONS = ['create', 'skip', 'merge'] as const;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];
export const MATCH_REASONS = ['email', 'phone', 'name'] as const;

/** Sent as the `options` part (JSON) of a preview request. */
export const contactImportPreviewOptionsSchema = z.object({
  /** Overrides the column mapping detected for a CSV file. */
  mapping: csvMappingSchema.optional(),
});

export const importPreviewContactSchema = z.object({
  index: z.number().int(),
  /** `organization`: a card with only a company name becomes an organization. */
  kind: z.enum(['person', 'organization']),
  /** An indirect contact (Monica: “partial” contact, known through a relationship). */
  indirect: z.boolean(),
  displayName: z.string(),
  /** E.g. organization and first email, for recognizing the contact. */
  details: z.string().nullable(),
  match: z
    .object({
      /** Existing person, or null when the match is an earlier contact in the file. */
      personId: idSchema.nullable(),
      organizationId: idSchema.nullable(),
      fileIndex: z.number().int().nullable(),
      displayName: z.string(),
      spaceId: idSchema.nullable(),
      reasons: z.array(z.enum(MATCH_REASONS)),
    })
    .nullable(),
  action: z.enum(IMPORT_ACTIONS),
});
export type ImportPreviewContact = z.infer<typeof importPreviewContactSchema>;

export const contactImportPreviewSchema = z.object({
  format: z.enum(CONTACT_IMPORT_FORMATS),
  fileName: z.string().nullable(),
  csv: z
    .object({
      template: z.enum(CSV_TEMPLATES),
      headers: z.array(z.string()),
      /** The first rows, to help with the mapping. */
      samples: z.array(z.array(z.string())),
      mapping: csvMappingSchema,
    })
    .nullable(),
  /** What else comes along (Monica): timeline entries, follow-ups, facts, relationships. */
  extras: z
    .object({
      entries: z.number().int(),
      reminders: z.number().int(),
      facts: z.number().int(),
      relationships: z.number().int(),
    })
    .nullable(),
  contacts: z.array(importPreviewContactSchema),
});
export type ContactImportPreview = z.infer<typeof contactImportPreviewSchema>;

/** Sent as the `options` part (JSON) of an import request. */
export const contactImportOptionsSchema = z.object({
  spaceId: idSchema,
  mapping: csvMappingSchema.optional(),
  /** Action per contact index; contacts not listed get the preview's default. */
  actions: z.record(z.string().regex(/^\d+$/), z.enum(IMPORT_ACTIONS)).default({}),
});
export type ContactImportOptions = z.input<typeof contactImportOptionsSchema>;

export const contactImportSchema = z.object({
  id: idSchema,
  format: z.enum(CONTACT_IMPORT_FORMATS),
  fileName: z.string().nullable(),
  spaceId: idSchema,
  created: z.number().int(),
  merged: z.number().int(),
  skipped: z.number().int(),
  createdAt: isoDateTimeSchema,
  undoneAt: isoDateTimeSchema.nullable(),
});
export type ContactImport = z.infer<typeof contactImportSchema>;

export const contactImportListSchema = z.array(contactImportSchema);

/** Fetching a Monica account through its API (then imported like an export file). */
export const monicaFetchRequestSchema = z.object({
  url: z.string().trim().min(1).max(500),
  token: z.string().trim().min(1).max(5000),
});
