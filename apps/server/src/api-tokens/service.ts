import { createHash, randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { ApiToken, ApiTokenScope } from '@app/shared';
import type { Db } from '../db/client';
import { apiTokens } from '../db/schema';
import { notFound } from '../lib/errors';
import { nowIso } from '../lib/sql';

export type ApiTokenRow = typeof apiTokens.$inferSelect;

export const TOKEN_PREFIX = 'pgt_';
const hash = (token: string) => createHash('sha256').update(token.trim()).digest('hex');

const toApiToken = (row: ApiTokenRow): ApiToken => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

export function listApiTokens(db: Db): ApiToken[] {
  return db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt)).all().map(toApiToken);
}

/** A new token (256 random bits); only its hash is stored. */
export function createApiToken(
  db: Db,
  input: { name: string; scope: ApiTokenScope; expiresInDays: number | null },
  now = new Date(),
) {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 86_400_000).toISOString()
    : null;
  const row = db
    .insert(apiTokens)
    .values({
      id: crypto.randomUUID(),
      name: input.name,
      scope: input.scope,
      tokenHash: hash(token),
      expiresAt,
    })
    .returning()
    .get();
  return { apiToken: toApiToken(row), token };
}

/** Revoking deletes the credential; requests with it get 401 from then on. */
export function deleteApiToken(db: Db, id: string) {
  if (db.delete(apiTokens).where(eq(apiTokens.id, id)).run().changes === 0) throw notFound();
}

/** The token row, or null if unknown or expired. Notes the last use (at most once a minute). */
export function validateApiToken(db: Db, token: string, now = new Date()): ApiTokenRow | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash(token)))
    .get();
  if (!row) return null;
  if (row.expiresAt && row.expiresAt <= now.toISOString()) return null;
  if (!row.lastUsedAt || now.getTime() - Date.parse(row.lastUsedAt) > 60_000) {
    const lastUsedAt = nowIso();
    db.update(apiTokens).set({ lastUsedAt }).where(eq(apiTokens.id, row.id)).run();
    row.lastUsedAt = lastUsedAt;
  }
  return row;
}

/** `Authorization: Bearer pgt_…` → the token, if any. */
export const bearerToken = (header: string | undefined) => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
};
