import { createHash, randomInt } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AppPassword, createAppPasswordRequestSchema } from '@app/shared';
import type { Db } from '../db/client';
import { appPasswords } from '../db/schema';
import type { AppEnv, Deps } from '../env';
import { getAccountRow } from '../auth/account';
import { DomainError, notFound } from '../lib/errors';
import { nowIso } from '../lib/sql';
import { validate } from '../lib/validate';
import { getLiveSpace } from '../spaces/service';

type Row = typeof appPasswords.$inferSelect;

/** Letters and digits that cannot be mixed up when typed on a phone (no 0/o, 1/l/i). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** `abcd-efgh-jkmn-pqrs`: 16 random characters ≈ 79 bits. */
export function generatePassword(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]!);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

const hash = (password: string) =>
  createHash('sha256').update(password.trim().toLowerCase()).digest('hex');

const toAppPassword = (row: Row): AppPassword => ({
  id: row.id,
  name: row.name,
  spaceIds: row.spaceIds ?? null,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

export function listAppPasswords(db: Db): AppPassword[] {
  return db
    .select()
    .from(appPasswords)
    .orderBy(desc(appPasswords.createdAt))
    .all()
    .map(toAppPassword);
}

export function createAppPassword(db: Db, input: { name: string; spaceIds: string[] | null }) {
  const spaceIds = input.spaceIds ? [...new Set(input.spaceIds)] : null;
  spaceIds?.forEach((id) => getLiveSpace(db, id));
  const password = generatePassword();
  const row = db
    .insert(appPasswords)
    .values({ id: crypto.randomUUID(), name: input.name, tokenHash: hash(password), spaceIds })
    .returning()
    .get();
  return { appPassword: toAppPassword(row), password };
}

/** Revoking deletes the credential; clients using it get 401 from then on. */
export function deleteAppPassword(db: Db, id: string) {
  if (db.delete(appPasswords).where(eq(appPasswords.id, id)).run().changes === 0) {
    throw notFound();
  }
}

/**
 * Checks HTTP Basic credentials: the account's email (any case) and an app
 * password. Returns the app password, or null.
 */
export function verifyAppPassword(db: Db, username: string, password: string): Row | null {
  const account = getAccountRow(db);
  if (!account || username.trim().toLowerCase() !== account.email.toLowerCase()) return null;
  const row = db
    .select()
    .from(appPasswords)
    .where(eq(appPasswords.tokenHash, hash(password)))
    .get();
  if (!row) return null;
  // At most one write per minute per client.
  if (!row.lastUsedAt || Date.now() - Date.parse(row.lastUsedAt) > 60_000) {
    db.update(appPasswords).set({ lastUsedAt: nowIso() }).where(eq(appPasswords.id, row.id)).run();
  }
  return row;
}

export function appPasswordRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json({ appPasswords: listAppPasswords(db) }))
    .post('/', validate('json', createAppPasswordRequestSchema), (c) => {
      const account = getAccountRow(db);
      if (!account) throw new DomainError(409, 'setup_required');
      const created = createAppPassword(db, c.req.valid('json'));
      return c.json(
        {
          ...created,
          username: account.email,
          server: config.publicUrl.host,
          url: `${config.publicUrl.origin}/dav/`,
        },
        201,
      );
    })
    .delete('/:id', (c) => {
      deleteAppPassword(db, c.req.param('id'));
      return c.body(null, 204);
    });
}
