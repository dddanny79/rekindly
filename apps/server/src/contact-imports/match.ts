import { and, isNull } from 'drizzle-orm';
import { foldText, personDisplayName } from '@app/shared';
import type { Db } from '../db/client';
import { contactPoints, organizations, people } from '../db/schema';
import { notDeleted } from '../lib/sql';
import type { ImportContact } from './contact';

export type MatchReason = 'email' | 'phone' | 'name';

export interface Candidate {
  personId: string | null;
  organizationId: string | null;
  /** A contact earlier in the same file. */
  fileIndex: number | null;
  displayName: string;
  spaceId: string | null;
}

/** Phone numbers compare by their last nine digits: +49 171 … = 0171 …. */
export function phoneKey(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-9) : null;
}

export const emailKey = (value: string) => value.trim().toLowerCase() || null;

/** First and last name, folded (Müller = Mueller = Muller); null without both. */
export function nameKey(first: string | null, last: string | null): string | null {
  if (!first?.trim() || !last?.trim()) return null;
  return foldText(`${first} ${last}`)
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REASON: Record<string, MatchReason> = { e: 'email', p: 'phone', n: 'name' };

/** Keys that identify a contact: `e:` email, `p:` phone, `n:` name, `o:` organization. */
export function contactKeys(c: ImportContact): string[] {
  if (c.kind === 'organization') {
    const name = c.organization.at(-1);
    return name ? [`o:${foldText(name).trim()}`] : [];
  }
  const keys: string[] = [];
  for (const p of c.points) {
    const key =
      p.kind === 'email' ? emailKey(p.value) : p.kind === 'phone' ? phoneKey(p.value) : null;
    if (key) keys.push(`${p.kind === 'email' ? 'e' : 'p'}:${key}`);
  }
  const name = nameKey(c.firstName, c.lastName);
  if (name) keys.push(`n:${name}`);
  return keys;
}

/**
 * Finds likely duplicates: same email, same phone number or same first and last
 * name, among the existing people and organizations and the contacts before in
 * the file.
 */
export class Matcher {
  private keys = new Map<string, Candidate>();

  add(keys: string[], candidate: Candidate) {
    for (const key of keys) if (!this.keys.has(key)) this.keys.set(key, candidate);
  }

  find(keys: string[]): { candidate: Candidate; reasons: MatchReason[] } | null {
    const found = new Map<Candidate, Set<MatchReason>>();
    for (const key of keys) {
      const candidate = this.keys.get(key);
      if (!candidate) continue;
      if (!found.has(candidate)) found.set(candidate, new Set());
      found.get(candidate)!.add(REASON[key[0]!] ?? 'name');
    }
    const order: MatchReason[] = ['email', 'phone', 'name'];
    const best = [...found].sort(
      (a, b) =>
        b[1].size - a[1].size ||
        Math.min(...[...a[1]].map((r) => order.indexOf(r))) -
          Math.min(...[...b[1]].map((r) => order.indexOf(r))),
    )[0];
    return best ? { candidate: best[0], reasons: order.filter((r) => best[1].has(r)) } : null;
  }

  /** All live people (also indirect contacts) and organizations of the instance. */
  static fromDb(db: Db): Matcher {
    const matcher = new Matcher();
    const rows = db.select().from(people).where(notDeleted(people)).all();
    const byId = new Map(rows.map((p) => [p.id, p]));
    const candidates = new Map(
      rows.map((p) => [
        p.id,
        {
          personId: p.id,
          organizationId: null,
          fileIndex: null,
          displayName: personDisplayName(p),
          spaceId: p.spaceId,
        },
      ]),
    );
    const points = db
      .select({
        personId: contactPoints.personId,
        kind: contactPoints.kind,
        value: contactPoints.value,
      })
      .from(contactPoints)
      .where(isNull(contactPoints.deletedAt))
      .all();
    for (const p of points) {
      const candidate = candidates.get(p.personId);
      const key =
        p.kind === 'email' ? emailKey(p.value) : p.kind === 'phone' ? phoneKey(p.value) : null;
      if (candidate && key) matcher.add([`${p.kind === 'email' ? 'e' : 'p'}:${key}`], candidate);
    }
    for (const [id, candidate] of candidates) {
      const p = byId.get(id)!;
      const name = nameKey(p.firstName, p.lastName);
      if (name) matcher.add([`n:${name}`], candidate);
    }
    const orgs = db
      .select()
      .from(organizations)
      .where(and(notDeleted(organizations)))
      .all();
    for (const o of orgs) {
      matcher.add([`o:${foldText(o.name).trim()}`], {
        personId: null,
        organizationId: o.id,
        fileIndex: null,
        displayName: o.name,
        spaceId: o.spaceId,
      });
    }
    return matcher;
  }
}
