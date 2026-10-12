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

// Calendar subscription (ICS) ------------------------------------------------------

export const calendarFeedSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Spaces whose follow-ups and birthdays are included; null = all. */
  spaceIds: z.array(idSchema).nullable(),
  includeBirthdays: z.boolean(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;

export const calendarFeedListResponseSchema = z.object({ feeds: z.array(calendarFeedSchema) });

export const createCalendarFeedRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  spaceIds: z.array(idSchema).min(1).max(50).nullable(),
  includeBirthdays: z.boolean(),
});

export const createCalendarFeedResponseSchema = z.object({
  feed: calendarFeedSchema,
  /** Subscription link with the secret; shown once. */
  url: z.string(),
});
export type CreateCalendarFeedResponse = z.infer<typeof createCalendarFeedResponseSchema>;
