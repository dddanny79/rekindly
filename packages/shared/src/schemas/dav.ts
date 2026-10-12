import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

/** A password for a CardDAV client; the password itself is only shown once. */
export const appPasswordSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Spaces in this client's address book; null = all spaces. */
  spaceIds: z.array(idSchema).nullable(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type AppPassword = z.infer<typeof appPasswordSchema>;

export const appPasswordListResponseSchema = z.object({
  appPasswords: z.array(appPasswordSchema),
});

export const createAppPasswordRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  spaceIds: z.array(idSchema).min(1).max(50).nullable(),
});

export const createAppPasswordResponseSchema = z.object({
  appPassword: appPasswordSchema,
  /** Shown once, e.g. `abcd-efgh-jkmn-pqrs`. */
  password: z.string(),
  /** What to enter in the client. */
  username: z.string(),
  server: z.string(),
  /** Full CardDAV address for other clients (DAVx⁵, Thunderbird). */
  url: z.string(),
});
export type CreateAppPasswordResponse = z.infer<typeof createAppPasswordResponseSchema>;
