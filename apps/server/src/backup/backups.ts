import { eq } from 'drizzle-orm';
import type { BackupConfigInput, BackupSettings, BackupStatus } from '@app/shared';
import type { Db } from '../db/client';
import { settings } from '../db/schema';
import { DomainError } from '../lib/errors';
import { log } from '../lib/log';
import { nowIso } from '../lib/sql';
import { decryptBackup, encryptBackup, openSecret, sealSecret } from './crypto';
import { exportAll, importAll } from './service';
import {
  BACKUP_PREFIX,
  backupTime,
  BACKUP_SUFFIX,
  type BackupTarget,
  type RemoteFile,
  s3Target,
  TargetError,
  webdavTarget,
} from './targets';

const CONFIG_KEY = 'backup.config';
const STATUS_KEY = 'backup.status';

/** Stored configuration; secrets are sealed with the instance key. */
interface StoredConfig {
  enabled: boolean;
  kind: 'webdav' | 's3';
  hour: number;
  keep: number;
  webdav?: { url: string; username: string; password: string };
  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  passphrase: string;
}

export interface BackupContext {
  db: Db;
  dataDir: string;
  /** Key for the stored secrets (see `secretKey`). */
  key: Buffer;
}

function readSetting<T>(db: Db, key: string): T | null {
  return (db.select().from(settings).where(eq(settings.key, key)).get()?.value as T) ?? null;
}

function writeSetting(db: Db, key: string, value: unknown) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export const readStatus = (db: Db): BackupStatus =>
  readSetting<BackupStatus>(db, STATUS_KEY) ?? {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    lastFile: null,
    lastSize: null,
  };

/** Configuration without secrets, for the settings page. */
export function backupSettings(db: Db): BackupSettings {
  const stored = readSetting<StoredConfig>(db, CONFIG_KEY);
  return {
    configured: !!stored,
    enabled: stored?.enabled ?? false,
    kind: stored?.kind ?? 'webdav',
    hour: stored?.hour ?? 3,
    keep: stored?.keep ?? 14,
    webdav: stored?.webdav
      ? { url: stored.webdav.url, username: stored.webdav.username, hasPassword: true }
      : null,
    s3: stored?.s3
      ? {
          endpoint: stored.s3.endpoint,
          region: stored.s3.region,
          bucket: stored.s3.bucket,
          prefix: stored.s3.prefix,
          accessKeyId: stored.s3.accessKeyId,
          hasSecret: true,
        }
      : null,
    hasPassphrase: !!stored?.passphrase,
    status: readStatus(db),
  };
}

/**
 * Saves the configuration. Secrets that are left empty keep their stored value,
 * so the settings page never needs to show them again.
 */
export function saveBackupSettings(ctx: BackupContext, input: BackupConfigInput): BackupSettings {
  const current = readSetting<StoredConfig>(ctx.db, CONFIG_KEY);
  const seal = (value: string | undefined, previous: string | undefined) =>
    value ? sealSecret(ctx.key, value) : previous;
  const passphrase = seal(input.passphrase, current?.passphrase);
  if (!passphrase) throw new DomainError(400, 'backup_passphrase_required');

  const next: StoredConfig = {
    enabled: input.enabled,
    kind: input.kind,
    hour: input.hour,
    keep: input.keep,
    passphrase,
  };
  if (input.kind === 'webdav') {
    const w = input.webdav;
    if (!w) throw new DomainError(400, 'backup_target_required');
    const password = seal(w.password, current?.webdav?.password);
    if (!password) throw new DomainError(400, 'backup_target_required');
    next.webdav = { url: w.url, username: w.username, password };
  } else {
    const s = input.s3;
    if (!s) throw new DomainError(400, 'backup_target_required');
    const secretAccessKey = seal(s.secretAccessKey, current?.s3?.secretAccessKey);
    if (!secretAccessKey) throw new DomainError(400, 'backup_target_required');
    next.s3 = { ...s, prefix: s.prefix ?? '', secretAccessKey };
  }
  writeSetting(ctx.db, CONFIG_KEY, next);
  return backupSettings(ctx.db);
}

function open(ctx: BackupContext, sealed: string): string {
  const value = openSecret(ctx.key, sealed);
  // E.g. the database was restored onto another server: enter the secrets again.
  if (value === null) throw new DomainError(409, 'backup_secrets_unreadable');
  return value;
}

function targetOf(ctx: BackupContext, config: StoredConfig): BackupTarget {
  if (config.kind === 'webdav' && config.webdav) {
    return webdavTarget({ ...config.webdav, password: open(ctx, config.webdav.password) });
  }
  if (config.kind === 's3' && config.s3) {
    return s3Target({ ...config.s3, secretAccessKey: open(ctx, config.s3.secretAccessKey) });
  }
  throw new DomainError(409, 'backup_not_configured');
}

function configOrFail(db: Db): StoredConfig {
  const config = readSetting<StoredConfig>(db, CONFIG_KEY);
  if (!config) throw new DomainError(409, 'backup_not_configured');
  return config;
}

/** `rekindly-2026-10-12T03-00-05Z.backup` (sorts by time). */
export const backupName = (date = new Date()) =>
  `${BACKUP_PREFIX}${date
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-')}${BACKUP_SUFFIX}`;

const targetMessage = (error: unknown) =>
  error instanceof TargetError || error instanceof DomainError
    ? error instanceof DomainError
      ? error.code
      : error.message
    : 'unknown error';

/** Writes and deletes a small file to check the connection. Throws on failure. */
export async function testTarget(ctx: BackupContext) {
  const target = targetOf(ctx, configOrFail(ctx.db));
  const name = `${BACKUP_PREFIX}connection-test.txt`;
  try {
    await target.put(name, Buffer.from('ok'));
    await target.remove(name);
  } catch (error) {
    throw new DomainError(502, 'backup_target_failed', targetMessage(error));
  }
}

/**
 * One backup: full export → gzip → encrypt → upload; then keep only the newest
 * `keep` backups at the target. The result is stored as status.
 */
export async function runBackup(ctx: BackupContext): Promise<BackupStatus> {
  const config = configOrFail(ctx.db);
  const status = readStatus(ctx.db);
  const startedAt = nowIso();
  try {
    const target = targetOf(ctx, config);
    const passphrase = open(ctx, config.passphrase);
    const file = encryptBackup(JSON.stringify(await exportAll(ctx.db, ctx.dataDir)), passphrase);
    const name = backupName();
    await target.put(name, file);
    const existing = (await target.list()).sort((a, b) =>
      backupTime(b.name).localeCompare(backupTime(a.name)),
    );
    for (const old of existing.slice(config.keep)) await target.remove(old.name);
    const next: BackupStatus = {
      ...status,
      lastRunAt: startedAt,
      lastSuccessAt: nowIso(),
      lastError: null,
      lastFile: name,
      lastSize: file.length,
    };
    writeSetting(ctx.db, STATUS_KEY, next);
    log.info(`Backup: ${name} (${Math.round(file.length / 1024)} KB) uploaded`);
    return next;
  } catch (error) {
    const next: BackupStatus = {
      ...status,
      lastRunAt: startedAt,
      lastError: targetMessage(error),
      lastErrorAt: nowIso(),
    };
    writeSetting(ctx.db, STATUS_KEY, next);
    log.error('Backup failed', error);
    return next;
  }
}

export async function listBackups(ctx: BackupContext): Promise<RemoteFile[]> {
  const target = targetOf(ctx, configOrFail(ctx.db));
  try {
    return (await target.list()).sort((a, b) =>
      backupTime(b.name).localeCompare(backupTime(a.name)),
    );
  } catch (error) {
    throw new DomainError(502, 'backup_target_failed', targetMessage(error));
  }
}

/** Restores a backup from the target into this (empty) instance. */
export async function restoreFromTarget(ctx: BackupContext, name: string, passphrase: string) {
  const target = targetOf(ctx, configOrFail(ctx.db));
  let file: Buffer;
  try {
    file = await target.get(name);
  } catch (error) {
    throw new DomainError(502, 'backup_target_failed', targetMessage(error));
  }
  return importAll(ctx.db, ctx.dataDir, JSON.parse(decryptBackup(file, passphrase)));
}

/** Local date `YYYY-MM-DD` in the server's time zone. */
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** True if a scheduled backup is due now (once per day from the set hour; retries hourly). */
export function backupDue(
  config: Pick<StoredConfig, 'enabled' | 'hour'> | null,
  status: BackupStatus,
  now = new Date(),
) {
  if (!config?.enabled || now.getHours() < config.hour) return false;
  if (status.lastSuccessAt && localDate(new Date(status.lastSuccessAt)) === localDate(now))
    return false;
  return !status.lastRunAt || now.getTime() - Date.parse(status.lastRunAt) > 60 * 60 * 1000;
}

/** Checks every ten minutes whether the nightly backup is due. */
export function scheduleBackups(ctx: BackupContext) {
  let running = false;
  const tick = () => {
    if (running) return;
    const config = readSetting<StoredConfig>(ctx.db, CONFIG_KEY);
    if (!backupDue(config, readStatus(ctx.db))) return;
    running = true;
    void runBackup(ctx).finally(() => {
      running = false;
    });
  };
  const timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

/** For the Today page: a failed or long overdue backup. */
export function backupWarning(
  db: Db,
  now = new Date(),
): { state: 'failed' | 'stale'; at: string } | null {
  const config = readSetting<StoredConfig>(db, CONFIG_KEY);
  if (!config?.enabled) return null;
  const status = readStatus(db);
  if (status.lastErrorAt && (!status.lastSuccessAt || status.lastErrorAt > status.lastSuccessAt)) {
    return { state: 'failed', at: status.lastErrorAt };
  }
  if (status.lastSuccessAt && now.getTime() - Date.parse(status.lastSuccessAt) > 3 * 86_400_000) {
    return { state: 'stale', at: status.lastSuccessAt };
  }
  return null;
}
