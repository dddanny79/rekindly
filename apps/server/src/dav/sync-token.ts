import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

/**
 * Settings key of this instance's id in sync tokens. It belongs to the instance,
 * not to the data: an export leaves it out and an import keeps it.
 */
export const DAV_INSTANCE_SETTING = 'dav.instance';

const read = (db: Db) =>
  db.select().from(settings).where(eq(settings.key, DAV_INSTANCE_SETTING)).get()?.value;

/**
 * The id that ties sync tokens to this database. After a restore onto a new
 * instance the change numbers start again; with a new id, devices notice that
 * their token is from somewhere else and sync everything once.
 */
export function davInstance(db: Db): string {
  const stored = read(db);
  if (typeof stored === 'string') return stored;
  const id = randomBytes(6).toString('hex');
  db.insert(settings).values({ key: DAV_INSTANCE_SETTING, value: id }).onConflictDoNothing().run();
  const kept = read(db);
  return typeof kept === 'string' ? kept : id;
}

/** `<instance>-<change number>`, also used as CTag. */
export const syncState = (instance: string, seq: number) => `${instance}-${seq}`;

/**
 * The change number in a sync token of this instance, or null for a token of
 * another instance or of a version before 0.3.5 (the client then syncs everything).
 */
export function tokenSeq(token: string, instance: string): number | null {
  const match = /\/([0-9a-f]+)-(\d+)$/.exec(token.trim());
  return match && match[1] === instance ? Number(match[2]) : null;
}
