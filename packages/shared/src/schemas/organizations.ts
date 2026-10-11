import { z } from 'zod';
import { fieldValueSchema } from './catalog';
import { idSchema, optionalText } from './common';
import { addressSchema, organizationRefSchema, personRefSchema } from './people';

export const organizationListItemSchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  parentId: idSchema.nullable(),
  name: z.string(),
  kind: z.string().nullable(),
  /** People with a current affiliation. */
  peopleCount: z.number().int(),
});
export type OrganizationListItem = z.infer<typeof organizationListItemSchema>;

export const organizationListResponseSchema = z.object({
  organizations: z.array(organizationListItemSchema),
});

export const organizationMemberSchema = z.object({
  affiliationId: idSchema,
  role: z.string().nullable(),
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
  person: personRefSchema,
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  parentId: idSchema.nullable(),
  name: z.string(),
  kind: z.string().nullable(),
  website: z.string().nullable(),
  notes: z.string().nullable(),
  /** From the top-level organization down to this one (inclusive). */
  path: organizationRefSchema.shape.path,
  children: z.array(z.object({ id: idSchema, name: z.string(), kind: z.string().nullable() })),
  currentMembers: z.array(organizationMemberSchema),
  formerMembers: z.array(organizationMemberSchema),
  addresses: z.array(addressSchema),
  fields: z.array(fieldValueSchema),
});
export type Organization = z.infer<typeof organizationSchema>;

export const organizationsQuerySchema = z.object({
  spaceId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
});

const websiteSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => (value ? value : null));

export const createOrganizationRequestSchema = z.object({
  spaceId: idSchema,
  name: z.string().trim().min(1).max(200),
  kind: optionalText(50).optional(),
  parentId: idSchema.nullable().optional(),
  website: websiteSchema.optional(),
});

export const updateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: optionalText(50).optional(),
  parentId: idSchema.nullable().optional(),
  website: websiteSchema.optional(),
  notes: optionalText(10_000).optional(),
});
