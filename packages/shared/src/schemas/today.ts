import { z } from 'zod';
import { dateOnlySchema, idSchema, isoDateTimeSchema } from './common';
import { personRefSchema, relatedToSchema } from './refs';
import { personDateKindSchema } from './people';
import { backupWarningSchema } from './backup';
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
  /** Set for indirect contacts: through whom they are known. */
  relatedTo: relatedToSchema.nullable(),
});
export type TodayBirthday = z.infer<typeof todayBirthdaySchema>;

/** A recurring day (wedding anniversary, memorial day …) in the next days. */
export const todayDateSchema = z.object({
  person: personRefSchema,
  dateId: idSchema,
  kind: personDateKindSchema,
  label: z.string().nullable(),
  /** `--MM-DD` or `YYYY-MM-DD` as stored. */
  date: z.string(),
  on: dateOnlySchema,
  inDays: z.number().int(),
  /** Full years on that day, if the year is known (never for name days). */
  years: z.number().int().nullable(),
  relatedTo: relatedToSchema.nullable(),
});
export type TodayDate = z.infer<typeof todayDateSchema>;

export const overdueContactSchema = z.object({
  person: personRefSchema,
  contactEveryDays: z.number().int(),
  /** null: no call, meeting or message yet (the rhythm counts from when it was set). */
  lastContactAt: isoDateTimeSchema.nullable(),
  /** Days past the rhythm. */
  overdueDays: z.number().int(),
});
export type OverdueContact = z.infer<typeof overdueContactSchema>;

export const recentPersonSchema = z.object({
  person: personRefSchema,
  /** “Role @ Organization”, or the summary. */
  subtitle: z.string().nullable(),
  relatedTo: relatedToSchema.nullable(),
  viewedAt: isoDateTimeSchema,
});
export type RecentPerson = z.infer<typeof recentPersonSchema>;

export const todayResponseSchema = z.object({
  date: dateOnlySchema,
  /** Open follow-ups due today or earlier, oldest first. */
  reminders: z.array(reminderSchema),
  birthdays: z.array(todayBirthdaySchema),
  /** Recurring days in the same window as birthdays, soonest first. */
  dates: z.array(todayDateSchema),
  overdueContacts: z.array(overdueContactSchema),
  recent: z.array(recentPersonSchema),
  /** Automatic backup failed or is long overdue. */
  backup: backupWarningSchema,
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
