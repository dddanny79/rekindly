import { z } from 'zod';

/** Error body of every non-2xx API response. */
export const errorResponseSchema = z.object({
  error: z.string(),
  /** Field-level validation issues, if any. */
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const isoDateTimeSchema = z.iso.datetime();
