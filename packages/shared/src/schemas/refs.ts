import { z } from 'zod';
import { idSchema } from './common';

export const personRefSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  initials: z.string(),
  spaceId: idSchema,
  photoUrl: z.string().nullable(),
});
export type PersonRef = z.infer<typeof personRefSchema>;
