import { z } from 'zod';
import { idSchema } from './common';

// Tags ---------------------------------------------------------------------------

export const tagSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string().nullable(),
  peopleCount: z.number().int(),
});
export type Tag = z.infer<typeof tagSchema>;
export const tagListResponseSchema = z.object({ tags: z.array(tagSchema) });

export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((name) => name.replace(/^#/, ''))
  .pipe(z.string().min(1));

export const createTagRequestSchema = z.object({ name: tagNameSchema });
export const updateTagRequestSchema = z.object({ name: tagNameSchema });

// Relationship types ---------------------------------------------------------------

export const relationshipTypeSchema = z.object({
  id: idSchema,
  name: z.string().nullable(),
  reverseName: z.string().nullable(),
  nameKey: z.string().nullable(),
  reverseNameKey: z.string().nullable(),
  symmetric: z.boolean(),
  sort: z.number().int(),
});
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export const relationshipTypeListResponseSchema = z.object({
  relationshipTypes: z.array(relationshipTypeSchema),
});

const relationshipName = z.string().trim().min(1).max(100);

/** For symmetric types the reverse name is the name. */
export const createRelationshipTypeRequestSchema = z
  .object({
    name: relationshipName,
    reverseName: relationshipName.optional(),
    symmetric: z.boolean(),
  })
  .refine((t) => t.symmetric || t.reverseName, { path: ['reverseName'], message: 'required' });

export const updateRelationshipTypeRequestSchema = z.object({
  name: relationshipName.optional(),
  reverseName: relationshipName.optional(),
});

// Custom fields -------------------------------------------------------------------

export const FIELD_TARGETS = ['person', 'organization'] as const;
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean', 'url'] as const;
export const fieldTargetSchema = z.enum(FIELD_TARGETS);
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const fieldDefinitionSchema = z.object({
  id: idSchema,
  target: fieldTargetSchema,
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  options: z.array(z.string()).nullable(),
  sort: z.number().int(),
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export const fieldDefinitionListResponseSchema = z.object({
  fieldDefinitions: z.array(fieldDefinitionSchema),
});

const optionsSchema = z.array(z.string().trim().min(1).max(100)).min(1).max(100);

export const createFieldDefinitionRequestSchema = z
  .object({
    target: fieldTargetSchema,
    label: z.string().trim().min(1).max(100),
    type: fieldTypeSchema,
    options: optionsSchema.optional(),
  })
  .refine((d) => d.type !== 'select' || d.options, { path: ['options'], message: 'required' });

export const updateFieldDefinitionRequestSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  options: optionsSchema.optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
});

export const fieldValueSchema = z.object({ definitionId: idSchema, value: z.string() });
export type FieldValue = z.infer<typeof fieldValueSchema>;

export const setFieldValueRequestSchema = z.object({ value: z.string().trim().max(2000) });

/** Checks a value against its field type; returns the normalized value or null. */
export function normalizeFieldValue(
  definition: Pick<FieldDefinition, 'type' | 'options'>,
  raw: string,
): string | null {
  const value = raw.trim();
  switch (definition.type) {
    case 'text':
      return value;
    case 'number':
      return value !== '' && Number.isFinite(Number(value)) ? String(Number(value)) : null;
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
    case 'boolean':
      return value === 'true' || value === 'false' ? value : null;
    case 'select':
      return definition.options?.includes(value) ? value : null;
    case 'url':
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
      } catch {
        return null;
      }
  }
}
