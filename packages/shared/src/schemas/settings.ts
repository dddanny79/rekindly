import { z } from 'zod';

/** Instance-wide settings stored on the server. */
export const instanceSettingsSchema = z.object({
  /** Passkey sign-in and registration; off by default (needs HTTPS or localhost). */
  passkeysEnabled: z.boolean(),
});
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;

export const updateInstanceSettingsRequestSchema = instanceSettingsSchema.partial();
export type UpdateInstanceSettingsRequest = z.infer<typeof updateInstanceSettingsRequestSchema>;
