import { eq } from 'drizzle-orm';
import type { MailSettings, MailSettingsInput } from '@app/shared';
import { getAccountRow } from '../auth/account';
import { openSecret, sealSecret } from '../backup/crypto';
import type { Db } from '../db/client';
import { settings } from '../db/schema';
import { DomainError } from '../lib/errors';
import { nowIso } from '../lib/sql';

const CONFIG = 'mail.config';
/** Delivery state (last sent, last error); stays with the instance. */
export const MAIL_STATUS_SETTING = 'mail.status';
const STATUS = MAIL_STATUS_SETTING;

type Security = MailSettings['security'];

interface Stored {
  host: string | null;
  port: number | null;
  security: Security;
  username: string | null;
  /** Sealed with the instance key. */
  password: string | null;
  from: string | null;
  digest: { enabled: boolean; hour: number };
}

export interface MailStatus {
  lastSentAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastDigestOn: string | null;
}

/** SMTP settings from the environment (SMTP_HOST …) take precedence over the app's. */
export interface MailEnv {
  host?: string;
  port?: number;
  security?: Security;
  username?: string;
  password?: string;
  from?: string;
}

/** What sending needs, password opened. */
export interface SmtpConfig {
  host: string;
  port: number;
  security: Security;
  username: string | null;
  password: string | null;
  from: string;
  to: string;
}

const read = <T>(db: Db, key: string): T | null =>
  (db.select().from(settings).where(eq(settings.key, key)).get()?.value as T) ?? null;
const write = (db: Db, key: string, value: unknown) =>
  db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();

const defaults: Stored = {
  host: null,
  port: null,
  security: 'starttls',
  username: null,
  password: null,
  from: null,
  digest: { enabled: false, hour: 7 },
};

export const readMailStatus = (db: Db): MailStatus =>
  read<MailStatus>(db, STATUS) ?? {
    lastSentAt: null,
    lastError: null,
    lastErrorAt: null,
    lastDigestOn: null,
  };

export function updateMailStatus(db: Db, patch: Partial<MailStatus>) {
  write(db, STATUS, { ...readMailStatus(db), ...patch });
}

export const defaultPort = (security: Security) =>
  security === 'tls' ? 465 : security === 'none' ? 25 : 587;

export function mailSettings(db: Db, env: MailEnv): MailSettings {
  const stored = { ...defaults, ...read<Stored>(db, CONFIG) };
  const fromEnv = !!env.host;
  const source = fromEnv ? 'env' : stored.host ? 'app' : 'none';
  const security = (fromEnv ? env.security : stored.security) ?? 'starttls';
  return {
    source,
    host: fromEnv ? env.host! : stored.host,
    port: (fromEnv ? env.port : stored.port) ?? (source === 'none' ? null : defaultPort(security)),
    security,
    username: (fromEnv ? env.username : stored.username) ?? null,
    hasPassword: fromEnv ? !!env.password : !!stored.password,
    from: (fromEnv ? env.from : stored.from) ?? null,
    to: getAccountRow(db)?.email ?? null,
    digest: stored.digest,
    status: readMailStatus(db),
  };
}

export function saveMailSettings(
  db: Db,
  key: Buffer,
  env: MailEnv,
  input: MailSettingsInput,
): MailSettings {
  const current = { ...defaults, ...read<Stored>(db, CONFIG) };
  const next: Stored = { ...current };
  if (input.digest) next.digest = input.digest;
  // With SMTP_* in the environment, only the digest is set in the app.
  if (!env.host) {
    if (input.host !== undefined) next.host = input.host || null;
    if (input.port !== undefined) next.port = input.port;
    if (input.security !== undefined) next.security = input.security;
    if (input.username !== undefined) next.username = input.username || null;
    if (input.password) next.password = sealSecret(key, input.password);
    if (input.from !== undefined) next.from = input.from || null;
    if (next.from && !/^[^@\s]+@[^@\s]+$/.test(next.from.replace(/^.*<|>$/g, ''))) {
      throw new DomainError(400, 'mail_invalid_from');
    }
  }
  write(db, CONFIG, next);
  return mailSettings(db, env);
}

/** The SMTP settings for sending; throws `mail_not_configured`. */
export function smtpConfig(db: Db, key: Buffer, env: MailEnv): SmtpConfig {
  const settings = mailSettings(db, env);
  if (settings.source === 'none' || !settings.host || !settings.to) {
    throw new DomainError(409, 'mail_not_configured');
  }
  let password: string | null = null;
  if (settings.source === 'env') password = env.password ?? null;
  else {
    const sealed = read<Stored>(db, CONFIG)?.password;
    if (sealed) {
      password = openSecret(key, sealed);
      if (password === null) throw new DomainError(409, 'mail_password_unreadable');
    }
  }
  return {
    host: settings.host,
    port: settings.port ?? defaultPort(settings.security),
    security: settings.security,
    username: settings.username,
    password,
    from: settings.from ?? settings.username ?? `rekindly@${settings.host}`,
    to: settings.to,
  };
}

export const mailReady = (db: Db, env: MailEnv) => {
  const s = mailSettings(db, env);
  return s.source !== 'none' && !!s.to;
};

export const markSent = (db: Db) => updateMailStatus(db, { lastSentAt: nowIso(), lastError: null });
export const markFailed = (db: Db, error: string) =>
  updateMailStatus(db, { lastError: error, lastErrorAt: nowIso() });
