import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DomainError } from '../lib/errors';

// Stored secrets (backup target credentials, backup password) ----------------------

const SECRET_FILE = 'secret.key';

/**
 * Key for secrets stored in the database: from `APP_SECRET`, else a random key in
 * `DATA_DIR/secret.key` (created on first use). A copy of the database alone
 * (e.g. a snapshot) then does not reveal the credentials.
 */
export function secretKey(dataDir: string, appSecret?: string): Buffer {
  if (appSecret) return createHash('sha256').update(appSecret).digest();
  const path = join(dataDir, SECRET_FILE);
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex');
}

export function sealSecret(key: Buffer, text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

/** null if the secret cannot be read (e.g. a different key after a restore). */
export function openSecret(key: Buffer, sealed: string): string | null {
  if (!sealed.startsWith('v1.')) return null;
  const raw = Buffer.from(sealed.slice(3), 'base64');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Backup files -------------------------------------------------------------------

/**
 * Backup file: `PGBACKUP1\n`, then salt (16), IV (12), auth tag (16) and the
 * AES-256-GCM encrypted, gzip-compressed export. The key comes from the backup
 * password via scrypt.
 */
const MAGIC = Buffer.from('PGBACKUP1\n');
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const deriveKey = (passphrase: string, salt: Buffer) =>
  scryptSync(passphrase.normalize('NFC'), salt, 32, SCRYPT);

export function isBackupFile(data: Buffer): boolean {
  return data.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptBackup(json: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const data = Buffer.concat([cipher.update(gzipSync(json)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

/** The export JSON inside a backup file; throws `wrong_passphrase` if it does not open. */
export function decryptBackup(file: Buffer, passphrase: string): string {
  if (!isBackupFile(file)) throw new DomainError(400, 'invalid_export');
  let offset = MAGIC.length;
  const take = (n: number) => file.subarray(offset, (offset += n));
  const salt = take(16);
  const iv = take(12);
  const tag = take(16);
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(tag);
    const zipped = Buffer.concat([decipher.update(file.subarray(offset)), decipher.final()]);
    return gunzipSync(zipped).toString('utf8');
  } catch {
    throw new DomainError(400, 'wrong_passphrase');
  }
}
