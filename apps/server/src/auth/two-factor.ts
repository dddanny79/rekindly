/**
 * Two-factor sign-in by email: after the password, a six-digit code goes to the
 * account's address. Codes live in memory (one process), 10 minutes, 5 attempts.
 * A browser can be trusted for 30 days (cookie + hashed token in the database).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client';
import { settings, trustedDevices } from '../db/schema';
import { nowIso } from '../lib/sql';
import { htmlMail, type Mail } from '../mail/send';
import { localeOf } from '../mail/digest';

const SETTING = 'auth.twoFactor';
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const TRUST_DAYS = 30;
const TRUST_COOKIE = 'trusted_device';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const twoFactorEnabled = (db: Db) =>
  (
    db.select().from(settings).where(eq(settings.key, SETTING)).get()?.value as
      { enabled?: boolean } | undefined
  )?.enabled === true;

export function setTwoFactor(db: Db, enabled: boolean) {
  const value = { enabled };
  db.insert(settings)
    .values({ key: SETTING, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
  if (!enabled) db.delete(trustedDevices).run();
}

type Purpose = 'login' | 'enable';

interface PendingCode {
  hash: string;
  purpose: Purpose;
  expires: number;
  attempts: number;
}

/** Codes waiting to be entered, by challenge id. */
export class TwoFactorCodes {
  private pending = new Map<string, PendingCode>();

  create(purpose: Purpose, now = Date.now()): { id: string; code: string } {
    for (const [id, p] of this.pending) if (p.expires < now) this.pending.delete(id);
    const id = crypto.randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pending.set(id, { hash: sha256(code), purpose, expires: now + CODE_TTL_MS, attempts: 0 });
    return { id, code };
  }

  /** True once for the right code; wrong codes count, after 5 the challenge is gone. */
  verify(id: string, code: string, purpose: Purpose, now = Date.now()): boolean {
    const p = this.pending.get(id);
    if (!p || p.purpose !== purpose || p.expires < now) {
      this.pending.delete(id);
      return false;
    }
    const ok = timingSafeEqual(Buffer.from(sha256(code)), Buffer.from(p.hash));
    if (ok) this.pending.delete(id);
    else if (++p.attempts >= MAX_ATTEMPTS) this.pending.delete(id);
    return ok;
  }
}

/** "e…a@example.com" */
export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  const shown = local.length <= 2 ? `${local[0] ?? ''}…` : `${local[0]}…${local.at(-1)}`;
  return `${shown}@${domain}`;
}

const TEXT = {
  en: {
    subject: (code: string) => `Your Rekindly sign-in code: ${code}`,
    title: 'Sign-in code',
    body: 'Enter this code to finish signing in. It is valid for 10 minutes.',
    enable: 'Enter this code to switch on sign-in codes by email. It is valid for 10 minutes.',
    footer: 'Not you? Someone knows your password — change it under Settings.',
  },
  de: {
    subject: (code: string) => `Dein Rekindly-Anmeldecode: ${code}`,
    title: 'Anmeldecode',
    body: 'Gib diesen Code ein, um die Anmeldung abzuschließen. Er ist 10 Minuten gültig.',
    enable:
      'Gib diesen Code ein, um Anmeldecodes per Mail einzuschalten. Er ist 10 Minuten gültig.',
    footer: 'Das warst nicht du? Dann kennt jemand dein Passwort — ändere es in den Einstellungen.',
  },
} as const;

export function codeMail(db: Db, code: string, purpose: Purpose): Mail {
  const t = TEXT[localeOf(db)];
  const intro = purpose === 'login' ? t.body : t.enable;
  return {
    subject: t.subject(code),
    text: `${intro}\n\n${code}\n\n--\n${t.footer}`,
    html: htmlMail(t.title, [{ lines: [{ text: intro }, { text: code }] }], t.footer),
  };
}

// Trusted devices ---------------------------------------------------------------------

export function trustDevice(c: Context, db: Db, publicUrl: URL, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TRUST_DAYS * 86_400_000).toISOString();
  db.insert(trustedDevices)
    .values({
      id: crypto.randomUUID(),
      tokenHash: sha256(token),
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
      expiresAt,
    })
    .run();
  setCookie(c, TRUST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: publicUrl.protocol === 'https:',
    path: '/api/v1/auth',
    maxAge: TRUST_DAYS * 86_400,
  });
}

/** The trusted device of this request, if its cookie is valid. */
export function trustedDeviceOf(c: Context, db: Db, now = new Date()) {
  const token = getCookie(c, TRUST_COOKIE);
  if (!token) return null;
  const row = db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.tokenHash, sha256(token)),
        gt(trustedDevices.expiresAt, now.toISOString()),
      ),
    )
    .get();
  if (!row) {
    deleteCookie(c, TRUST_COOKIE, { path: '/api/v1/auth' });
    return null;
  }
  db.update(trustedDevices)
    .set({ lastUsedAt: nowIso() })
    .where(eq(trustedDevices.id, row.id))
    .run();
  return row;
}

export function listTrustedDevices(db: Db, currentId: string | null, now = new Date()) {
  db.delete(trustedDevices).where(lte(trustedDevices.expiresAt, now.toISOString())).run();
  return db
    .select()
    .from(trustedDevices)
    .orderBy(desc(trustedDevices.createdAt))
    .all()
    .map((d) => ({
      id: d.id,
      userAgent: d.userAgent,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
      expiresAt: d.expiresAt,
      current: d.id === currentId,
    }));
}

export const forgetTrustedDevice = (db: Db, id: string) =>
  db.delete(trustedDevices).where(eq(trustedDevices.id, id)).run().changes > 0;

/** After a password change no device stays trusted. */
export const forgetAllTrustedDevices = (db: Db) => db.delete(trustedDevices).run();

/** For the settings: the device id of this request without touching it. */
export function currentTrustedId(c: Context, db: Db) {
  const token = getCookie(c, TRUST_COOKIE);
  if (!token) return null;
  return (
    db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(eq(trustedDevices.tokenHash, sha256(token)))
      .get()?.id ?? null
  );
}
