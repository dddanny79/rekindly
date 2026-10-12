import { z } from 'zod';

/** Error body of every non-2xx API response. */
export const errorResponseSchema = z.object({
  error: z.string(),
  /** Technical detail for some errors (e.g. what a backup target answered). */
  detail: z.string().optional(),
  /** Field-level validation issues, if any. */
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const isoDateTimeSchema = z.iso.datetime();

export const idSchema = z.string().min(1).max(100);

/** Optional free text: trimmed; empty becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

/** `YYYY-MM-DD`. */
export const dateOnlySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

/** `--MM-DD` or `YYYY-MM-DD` (year optional). */
export const birthdaySchema = z.string().regex(/^(\d{4}|-)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
export const partialDateSchema = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/);

/** Seeded rows carry an i18n key, user-created ones a name. */
export const labelRefSchema = z.object({
  name: z.string().nullable(),
  nameKey: z.string().nullable(),
});
export type LabelRef = z.infer<typeof labelRefSchema>;
