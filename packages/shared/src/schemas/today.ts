import { z } from 'zod';
import { dateOnlySchema, idSchema, isoDateTimeSchema } from './common';
import { personRefSchema } from './refs';
import { reminderSchema } from './timeline';

/** Days ahead (after today) for upcoming birthdays. */
export const TODAY_BIRTHDAY_DAYS = 14;
/** How many recently viewed people are listed. */
export const TODAY_RECENT_LIMIT = 8;

export const todayQuerySchema = z.object({
  /** The viewer's local date; defaults to the server's UTC date. */
  date: dateOnlySchema.optional(),
  spaceId: idSchema.optional(),
});
export type TodayQuery = z.input<typeof todayQuerySchema>;

export const todayBirthdaySchema = z.object({
  person: personRefSchema,
  /** `--MM-DD` or `YYYY-MM-DD` as stored. */
  birthday: z.string(),
  /** The next occurrence, `YYYY-MM-DD`. */
  on: dateOnlySchema,
  inDays: z.number().int(),
  /** Age on that day, if the year is known. */
  turns: z.number().int().nullable(),
});
export type TodayBirthday = z.infer<typeof todayBirthdaySchema>;

export const overdueContactSchema = z.object({
  person: personRefSchema,
  contactEveryDays: z.number().int(),
  lastContactAt: isoDateTimeSchema.nullable(),
  /** Days past the rhythm; null if there was no contact yet. */
  overdueDays: z.number().int().nullable(),
});
export type OverdueContact = z.infer<typeof overdueContactSchema>;

export const recentPersonSchema = z.object({
  person: personRefSchema,
  /** “Role @ Organization”, or the summary. */
  subtitle: z.string().nullable(),
  viewedAt: isoDateTimeSchema,
});
export type RecentPerson = z.infer<typeof recentPersonSchema>;

export const todayResponseSchema = z.object({
  date: dateOnlySchema,
  /** Open follow-ups due today or earlier, oldest first. */
  reminders: z.array(reminderSchema),
  birthdays: z.array(todayBirthdaySchema),
  overdueContacts: z.array(overdueContactSchema),
  recent: z.array(recentPersonSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
