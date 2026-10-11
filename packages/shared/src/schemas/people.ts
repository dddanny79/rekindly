import { z } from 'zod';
import { fieldValueSchema } from './catalog';
import {
  birthdaySchema,
  idSchema,
  isoDateTimeSchema,
  labelRefSchema,
  optionalText,
  partialDateSchema,
} from './common';

// Building blocks ---------------------------------------------------------------

export const CONTACT_POINT_KINDS = ['phone', 'email', 'url', 'messenger', 'social'] as const;
export const contactPointKindSchema = z.enum(CONTACT_POINT_KINDS);
export type ContactPointKind = z.infer<typeof contactPointKindSchema>;

export const contactPointSchema = z.object({
  id: idSchema,
  kind: contactPointKindSchema,
  label: z.string().nullable(),
  value: z.string(),
  isPrimary: z.boolean(),
});
export type ContactPoint = z.infer<typeof contactPointSchema>;

export const createContactPointRequestSchema = z.object({
  kind: contactPointKindSchema,
  label: optionalText(50).optional(),
  value: z.string().trim().min(1).max(500),
  isPrimary: z.boolean().optional(),
});
export const updateContactPointRequestSchema = createContactPointRequestSchema.partial();

export const addressSchema = z.object({
  id: idSchema,
  label: z.string().nullable(),
  street: z.string().nullable(),
  zip: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
});
export type Address = z.infer<typeof addressSchema>;

const addressFields = {
  label: optionalText(50).optional(),
  street: optionalText(200).optional(),
  zip: optionalText(20).optional(),
  city: optionalText(100).optional(),
  region: optionalText(100).optional(),
  country: optionalText(100).optional(),
};
export const createAddressRequestSchema = z
  .object(addressFields)
  .refine((a) => a.street || a.zip || a.city || a.region || a.country, {
    message: 'empty_address',
  });
export const updateAddressRequestSchema = z.object(addressFields);

/** Organization with its path from the top-level organization down to itself. */
export const organizationRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.string().nullable(),
  path: z.array(z.object({ id: idSchema, name: z.string() })),
});
export type OrganizationRef = z.infer<typeof organizationRefSchema>;

export const affiliationSchema = z.object({
  id: idSchema,
  role: z.string().nullable(),
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
  isPrimary: z.boolean(),
  organization: organizationRefSchema,
});
export type Affiliation = z.infer<typeof affiliationSchema>;

const affiliationFields = {
  role: optionalText(200).optional(),
  startedOn: partialDateSchema.nullable().optional(),
  endedOn: partialDateSchema.nullable().optional(),
  isPrimary: z.boolean().optional(),
};
export const createAffiliationRequestSchema = z.object({
  organizationId: idSchema,
  ...affiliationFields,
});
export const updateAffiliationRequestSchema = z.object(affiliationFields);

export const personRefSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  initials: z.string(),
  spaceId: idSchema,
  photoUrl: z.string().nullable(),
});
export type PersonRef = z.infer<typeof personRefSchema>;

/** A relationship as seen from one person: `label` is what `person` is to them. */
export const relationshipSchema = z.object({
  id: idSchema,
  typeId: idSchema,
  label: labelRefSchema,
  person: personRefSchema,
  note: z.string().nullable(),
});
export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * “`personId` is `type.name` of this person”, or with `reverse` “… is
 * `type.reverseName` of this person” (e.g. pick “child” from the parent type).
 */
export const createRelationshipRequestSchema = z.object({
  personId: idSchema,
  typeId: idSchema,
  reverse: z.boolean().optional(),
  note: optionalText(500).optional(),
});
export const updateRelationshipRequestSchema = z.object({ note: optionalText(500) });

export const tagRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string().nullable(),
});
export type TagRef = z.infer<typeof tagRefSchema>;

// Person -------------------------------------------------------------------------

export const personSchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  displayName: z.string(),
  initials: z.string(),
  prefix: z.string().nullable(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  suffix: z.string().nullable(),
  nickname: z.string().nullable(),
  maidenName: z.string().nullable(),
  pronouns: z.string().nullable(),
  birthday: z.string().nullable(),
  summary: z.string().nullable(),
  metWhere: z.string().nullable(),
  metWhen: z.string().nullable(),
  metThrough: personRefSchema.nullable(),
  photoUrl: z.string().nullable(),
  favorite: z.boolean(),
  contactEveryDays: z.number().int().nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  contactPoints: z.array(contactPointSchema),
  addresses: z.array(addressSchema),
  affiliations: z.array(affiliationSchema),
  relationships: z.array(relationshipSchema),
  tags: z.array(tagRefSchema),
  fields: z.array(fieldValueSchema),
});
export type Person = z.infer<typeof personSchema>;

export const personListItemSchema = z.object({
  id: idSchema,
  spaceId: idSchema,
  displayName: z.string(),
  initials: z.string(),
  summary: z.string().nullable(),
  photoUrl: z.string().nullable(),
  favorite: z.boolean(),
  archivedAt: isoDateTimeSchema.nullable(),
  /** Main role, e.g. “Leitung Einkauf” @ “Standort Köln”. */
  role: z.string().nullable(),
  organization: z.object({ id: idSchema, name: z.string() }).nullable(),
  tags: z.array(tagRefSchema),
  lastContactAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type PersonListItem = z.infer<typeof personListItemSchema>;

export const PEOPLE_SORTS = ['name', 'updated', 'lastContact'] as const;

const booleanParam = z.enum(['true', 'false']).transform((v) => v === 'true');

export const peopleQuerySchema = z.object({
  spaceId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
  tagId: idSchema.optional(),
  organizationId: idSchema.optional(),
  favorite: booleanParam.optional(),
  /** Archived people are hidden unless this is true. */
  archived: booleanParam.optional(),
  sort: z.enum(PEOPLE_SORTS).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type PeopleQuery = z.input<typeof peopleQuerySchema>;

export const personListResponseSchema = z.object({ people: z.array(personListItemSchema) });

/** Quick entry: first and/or last name, optionally with organization and role. */
export const createPersonRequestSchema = z
  .object({
    spaceId: idSchema,
    firstName: optionalText(100).optional(),
    lastName: optionalText(100).optional(),
    organizationId: idSchema.optional(),
    role: optionalText(200).optional(),
  })
  .refine((p) => p.firstName || p.lastName, { message: 'name_required', path: ['firstName'] });

const nameField = optionalText(100).optional();
export const updatePersonRequestSchema = z.object({
  spaceId: idSchema.optional(),
  prefix: nameField,
  firstName: nameField,
  middleName: nameField,
  lastName: nameField,
  suffix: nameField,
  nickname: nameField,
  maidenName: nameField,
  pronouns: optionalText(50).optional(),
  birthday: birthdaySchema.nullable().optional(),
  summary: optionalText(300).optional(),
  metWhere: optionalText(300).optional(),
  metWhen: partialDateSchema.nullable().optional(),
  metThroughPersonId: idSchema.nullable().optional(),
  favorite: z.boolean().optional(),
  contactEveryDays: z.number().int().min(1).max(3650).nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdatePersonRequest = z.input<typeof updatePersonRequestSchema>;

export const addPersonTagRequestSchema = z.object({ name: z.string().trim().min(1).max(50) });
