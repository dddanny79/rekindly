import { personDisplayName } from '@app/shared';
import type { CardAddress, CardPoint } from '../dav/vcard';

/** A contact read from an import file, before it becomes a person or organization. */
export interface ImportContact {
  /** `organization`: a card with only a company name (no person). */
  kind: 'person' | 'organization';
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  nickname: string | null;
  /** `YYYY-MM-DD` or `--MM-DD`. */
  birthday: string | null;
  /** Organization path from the top, e.g. ["Beispiel GmbH", "Vertrieb"]. */
  organization: string[];
  title: string | null;
  note: string | null;
  points: CardPoint[];
  addresses: CardAddress[];
  tags: string[];
  favorite: boolean;
  photo: Buffer | null;
  /** vCard lines without a field in the app, kept for CardDAV. */
  extraLines: string[];
}

export const emptyContact = (): ImportContact => ({
  kind: 'person',
  prefix: null,
  firstName: null,
  middleName: null,
  lastName: null,
  suffix: null,
  nickname: null,
  birthday: null,
  organization: [],
  title: null,
  note: null,
  points: [],
  addresses: [],
  tags: [],
  favorite: false,
  photo: null,
  extraLines: [],
});

export const hasName = (c: ImportContact) => !!(c.firstName || c.lastName || c.nickname);

/**
 * Final touches for every format: a card without a person's name but with a
 * company becomes an organization; returns null if nothing usable is left.
 */
export function finishContact(c: ImportContact): ImportContact | null {
  c.points = c.points.filter((p) => p.value.trim());
  c.tags = [...new Set(c.tags.map((t) => t.trim()).filter(Boolean))];
  if (hasName(c)) return c;
  if (c.organization.length) return { ...c, kind: 'organization' };
  return null;
}

export const contactName = (c: ImportContact) =>
  c.kind === 'organization' ? c.organization.join(' › ') : personDisplayName(c);

/** "Beispiel GmbH · erika@example.com": helps to recognize a contact in the preview. */
export function contactDetails(c: ImportContact): string | null {
  const parts = [
    c.kind === 'person' ? c.organization.at(-1) : null,
    c.points.find((p) => p.kind === 'email')?.value ?? c.points[0]?.value,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Reads text as UTF-8 (with or without BOM), falling back to Windows-1252. */
export function decodeText(data: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}
