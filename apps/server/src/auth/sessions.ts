import { createHash, randomBytes } from 'node:crypto';
import { eq, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions } from '../db/schema';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions are extended at most once per day to avoid a write on every request. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export type Session = typeof sessions.$inferSelect;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: Db, userAgent: string | undefined, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const session = db
    .insert(sessions)
    .values({
      id: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      lastSeenAt: now.toISOString(),
      userAgent: userAgent?.slice(0, 500) ?? null,
    })
    .returning()
    .get();
  return { token, session };
}

/** Returns the session for a token if it is valid, extending it when due. */
export function validateSession(db: Db, token: string, now = new Date()): Session | null {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .get();
  if (!session) return null;
  if (new Date(session.expiresAt) <= now) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }
  if (now.getTime() - new Date(session.lastSeenAt).getTime() > RENEW_AFTER_MS) {
    return db
      .update(sessions)
      .set({
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      })
      .where(eq(sessions.id, session.id))
      .returning()
      .get()!;
  }
  return session;
}

export function deleteSession(db: Db, sessionId: string) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

/** Signs out everywhere, optionally keeping the current session. */
export function deleteAllSessions(db: Db, exceptSessionId?: string) {
  if (exceptSessionId) db.delete(sessions).where(ne(sessions.id, exceptSessionId)).run();
  else db.delete(sessions).run();
}

export function deleteExpiredSessions(db: Db, now = new Date()) {
  db.delete(sessions).where(lt(sessions.expiresAt, now.toISOString())).run();
}
