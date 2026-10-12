import { z } from 'zod';
import { isoDateTimeSchema } from './common';

export const backupStatusSchema = z.object({
  lastRunAt: isoDateTimeSchema.nullable(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: isoDateTimeSchema.nullable(),
  lastFile: z.string().nullable(),
  lastSize: z.number().int().nullable(),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const BACKUP_KINDS = ['webdav', 's3'] as const;

/** Backup configuration as shown in the settings (secrets are never returned). */
export const backupSettingsSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  kind: z.enum(BACKUP_KINDS),
  /** Local hour (server time zone) from which the nightly backup runs. */
  hour: z.number().int(),
  /** Number of backups kept at the target. */
  keep: z.number().int(),
  webdav: z.object({ url: z.string(), username: z.string(), hasPassword: z.boolean() }).nullable(),
  s3: z
    .object({
      endpoint: z.string(),
      region: z.string(),
      bucket: z.string(),
      prefix: z.string(),
      accessKeyId: z.string(),
      hasSecret: z.boolean(),
    })
    .nullable(),
  hasPassphrase: z.boolean(),
  status: backupStatusSchema,
});
export type BackupSettings = z.infer<typeof backupSettingsSchema>;

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'http_url' });

/** Empty secrets keep the stored value. */
export const backupConfigInputSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(BACKUP_KINDS),
  hour: z.number().int().min(0).max(23),
  keep: z.number().int().min(1).max(365),
  passphrase: z.string().min(8).max(200).optional(),
  webdav: z
    .object({
      url: httpUrl,
      username: z.string().trim().max(200),
      password: z.string().max(500).optional(),
    })
    .optional(),
  s3: z
    .object({
      endpoint: httpUrl,
      region: z.string().trim().min(1).max(50),
      bucket: z.string().trim().min(1).max(100),
      prefix: z.string().trim().max(200).optional(),
      accessKeyId: z.string().trim().min(1).max(200),
      secretAccessKey: z.string().max(500).optional(),
    })
    .optional(),
});
export type BackupConfigInput = z.infer<typeof backupConfigInputSchema>;

export const backupFileSchema = z.object({
  name: z.string(),
  size: z.number().int(),
  modified: isoDateTimeSchema.nullable(),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

export const backupFileListResponseSchema = z.object({ files: z.array(backupFileSchema) });

export const restoreBackupRequestSchema = z.object({
  name: z.string().min(1).max(200),
  passphrase: z.string().min(1).max(200),
});

/** Today page: a failed or long overdue automatic backup. */
export const backupWarningSchema = z
  .object({ state: z.enum(['failed', 'stale']), at: isoDateTimeSchema })
  .nullable();
