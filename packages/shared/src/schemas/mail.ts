import { z } from 'zod';
import { accountSchema } from './auth';
import { dateOnlySchema, idSchema, isoDateTimeSchema } from './common';

export const MAIL_SECURITY = ['starttls', 'tls', 'none'] as const;

/** Mail settings as shown in the app (the SMTP password is never returned). */
export const mailSettingsSchema = z.object({
  /** `env`: set by SMTP_* environment variables (read-only in the app). */
  source: z.enum(['none', 'app', 'env']),
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  security: z.enum(MAIL_SECURITY),
  username: z.string().nullable(),
  hasPassword: z.boolean(),
  from: z.string().nullable(),
  /** Where mails go: the account's email address. */
  to: z.string().nullable(),
  digest: z.object({ enabled: z.boolean(), hour: z.number().int().min(0).max(23) }),
  status: z.object({
    lastSentAt: isoDateTimeSchema.nullable(),
    lastError: z.string().nullable(),
    lastErrorAt: isoDateTimeSchema.nullable(),
    lastDigestOn: dateOnlySchema.nullable(),
  }),
});
export type MailSettings = z.infer<typeof mailSettingsSchema>;

export const mailSettingsInputSchema = z.object({
  host: z.string().trim().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  security: z.enum(MAIL_SECURITY).optional(),
  username: z.string().trim().max(255).optional(),
  /** Empty keeps the stored password. */
  password: z.string().max(1000).optional(),
  from: z.string().trim().max(320).optional(),
  digest: z.object({ enabled: z.boolean(), hour: z.number().int().min(0).max(23) }).optional(),
});
export type MailSettingsInput = z.infer<typeof mailSettingsInputSchema>;

// Two-factor sign-in by email --------------------------------------------------------

/** After the password: either signed in, or a code was sent by mail. */
export const loginResponseSchema = z.union([
  z.object({ account: accountSchema }),
  z.object({
    twoFactor: z.object({
      challengeId: idSchema,
      /** Masked address the code went to, e.g. "e…a@example.com". */
      sentTo: z.string(),
    }),
  }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const twoFactorCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export const loginVerifyRequestSchema = z.object({
  challengeId: idSchema,
  code: twoFactorCodeSchema,
  /** Remember this browser for 30 days. */
  trustDevice: z.boolean().default(false),
});

export const trustedDeviceSchema = z.object({
  id: idSchema,
  userAgent: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  current: z.boolean(),
});

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  /** Mail is set up, so codes can be sent. */
  mailReady: z.boolean(),
  trustedDevices: z.array(trustedDeviceSchema),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

export const twoFactorStartResponseSchema = z.object({ challengeId: idSchema, sentTo: z.string() });

export const twoFactorConfirmRequestSchema = z.object({
  challengeId: idSchema,
  code: twoFactorCodeSchema,
});

export const twoFactorDisableRequestSchema = z.object({ password: z.string().min(1).max(1024) });
