import { z } from 'zod';
import { NAME_DISPLAY_ORDERS, NAME_SORT_ORDERS } from '../text';

/** Instance-wide settings stored on the server. */
export const instanceSettingsSchema = z.object({
  /** Passkey sign-in and registration; off by default (needs HTTPS or localhost). */
  passkeysEnabled: z.boolean(),
  /** "Jana Berger" or "Berger, Jana", everywhere the app writes a person's name. */
  nameDisplayOrder: z.enum(NAME_DISPLAY_ORDERS),
  /** People lists and pickers sorted by last name or first name. */
  nameSortOrder: z.enum(NAME_SORT_ORDERS),
});
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;

export const updateInstanceSettingsRequestSchema = instanceSettingsSchema.partial();
export type UpdateInstanceSettingsRequest = z.infer<typeof updateInstanceSettingsRequestSchema>;
