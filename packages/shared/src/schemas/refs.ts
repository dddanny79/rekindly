import { z } from 'zod';
import { idSchema, labelRefSchema } from './common';

export const personRefSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  initials: z.string(),
  spaceId: idSchema,
  photoUrl: z.string().nullable(),
});
export type PersonRef = z.infer<typeof personRefSchema>;

/**
 * How an indirect contact is known: “Kind von Jana Berger” = `label` (from the
 * indirect contact's point of view) and the contact `person`.
 */
export const relatedToSchema = z.object({ label: labelRefSchema, person: personRefSchema });
export type RelatedTo = z.infer<typeof relatedToSchema>;
