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

/**
 * Birthdays in a calendar feed. `indirect`: only indirect contacts, which CardDAV
 * does not put on the phone (the phone shows the others' birthdays itself).
 */
export const FEED_BIRTHDAYS = ['none', 'indirect', 'all'] as const;
export const feedBirthdaysSchema = z.enum(FEED_BIRTHDAYS);
export type FeedBirthdays = z.infer<typeof feedBirthdaysSchema>;

export const calendarFeedSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Spaces whose follow-ups and birthdays are included; null = all. */
  spaceIds: z.array(idSchema).nullable(),
  birthdays: feedBirthdaysSchema,
  /** Deprecated: `birthdays` is not `none`. */
  includeBirthdays: z.boolean(),
  /** Wedding anniversaries, memorial days and other recurring days marked for reminders. */
  includeDates: z.boolean(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;

export const calendarFeedListResponseSchema = z.object({ feeds: z.array(calendarFeedSchema) });

const feedName = z.string().trim().min(1).max(60);
const feedSpaces = z.array(idSchema).min(1).max(50).nullable();

export const createCalendarFeedRequestSchema = z.object({
  name: feedName,
  spaceIds: feedSpaces,
  /** Default `none` (or `all` with the deprecated `includeBirthdays: true`). */
  birthdays: feedBirthdaysSchema.optional(),
  /** Deprecated: use `birthdays`. */
  includeBirthdays: z.boolean().optional(),
  includeDates: z.boolean().default(false),
});

/** Changes a subscription; its link stays the same. */
export const updateCalendarFeedRequestSchema = z.object({
  name: feedName.optional(),
  spaceIds: feedSpaces.optional(),
  birthdays: feedBirthdaysSchema.optional(),
  includeDates: z.boolean().optional(),
});
export type UpdateCalendarFeedRequest = z.infer<typeof updateCalendarFeedRequestSchema>;

export const calendarFeedResponseSchema = z.object({ feed: calendarFeedSchema });

export const createCalendarFeedResponseSchema = z.object({
  feed: calendarFeedSchema,
  /** Subscription link with the secret; shown once. */
  url: z.string(),
});
export type CreateCalendarFeedResponse = z.infer<typeof createCalendarFeedResponseSchema>;
