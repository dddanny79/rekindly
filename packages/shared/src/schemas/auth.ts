import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, SUPPORTED_LOCALES } from '../constants';
import { isoDateTimeSchema } from './common';

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(1024);

export const accountSchema = z.object({
  name: z.string(),
  email: z.string(),
  locale: localeSchema,
});
export type Account = z.infer<typeof accountSchema>;

export const authStatusResponseSchema = z.object({
  /** True until the single account has been created. */
  setupRequired: z.boolean(),
  authenticated: z.boolean(),
  account: accountSchema.nullable(),
  /** Whether the sign-in page offers passkeys. */
  passkeysEnabled: z.boolean(),
});
export type AuthStatusResponse = z.infer<typeof authStatusResponseSchema>;

export const setupRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  password: passwordSchema,
  locale: localeSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceType: z.string().nullable(),
  backedUp: z.boolean(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type Passkey = z.infer<typeof passkeySchema>;

export const passkeyListResponseSchema = z.object({ passkeys: z.array(passkeySchema) });

export const passkeyNameSchema = z.string().trim().min(1).max(100);

export const renamePasskeyRequestSchema = z.object({ name: passkeyNameSchema });

/**
 * WebAuthn ceremony payloads are produced and checked by SimpleWebAuthn; the API only
 * checks their outer shape.
 */
export const webAuthnResponseSchema = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.looseObject({}),
});

export const passkeyRegistrationVerifyRequestSchema = z.object({
  name: passkeyNameSchema.optional(),
  response: webAuthnResponseSchema,
});

export const passkeyLoginVerifyRequestSchema = z.object({
  response: webAuthnResponseSchema,
});
