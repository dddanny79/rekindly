import { parseLine, parseVcard, unescapeText } from '../dav/vcard';
import { emptyContact, finishContact, type ImportContact } from './contact';

/** Splits a file with several vCards into the single cards. */
export function splitVcards(text: string): string[] {
  const cards: string[] = [];
  let current: string[] | null = null;
  let depth = 0;
  for (const line of text.split(/\r?\n/)) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      depth++;
      if (depth === 1) current = [];
    }
    current?.push(line);
    if (upper === 'END:VCARD' && depth > 0) {
      depth--;
      if (depth === 0 && current) {
        cards.push(current.join('\n'));
        current = null;
      }
    }
  }
  return cards;
}

const hasQuotedPrintable = (head: string) => /(^|;)(ENCODING=)?QUOTED-PRINTABLE(;|$)/i.test(head);

function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const hex = value[i] === '=' ? value.slice(i + 1, i + 3) : '';
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(...Buffer.from(value[i]!, 'utf8'));
  }
  try {
    return new TextDecoder(charset).decode(Buffer.from(bytes));
  } catch {
    return Buffer.from(bytes).toString('utf8');
  }
}

/**
 * vCard 2.1 (older Android, Outlook): quoted-printable values with soft line
 * breaks become plain vCard 3.0 lines.
 */
export function normalizeLegacy(card: string): string {
  const lines = card.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    const colon = line.indexOf(':');
    const head = colon > 0 ? line.slice(0, colon) : '';
    if (!hasQuotedPrintable(head)) {
      out.push(line);
      continue;
    }
    while (line.endsWith('=') && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i];
    const charset = /CHARSET=([^;:]+)/i.exec(head)?.[1] ?? 'utf-8';
    const params = head
      .split(';')
      .filter((p) => !/^(ENCODING=)?QUOTED-PRINTABLE$/i.test(p) && !/^CHARSET=/i.test(p));
    const value = decodeQuotedPrintable(line.slice(colon + 1), charset).replace(/\r?\n/g, '\\n');
    out.push(`${params.join(';')}:${value}`);
  }
  return out.join('\n');
}

/** Reads all contacts of a .vcf file (vCard 2.1, 3.0, 4.0). */
export function readVcards(text: string, locale: 'en' | 'de'): ImportContact[] {
  const contacts: ImportContact[] = [];
  for (const raw of splitVcards(text)) {
    const card = parseVcard(normalizeLegacy(raw), { locale });
    const contact: ImportContact = { ...emptyContact(), ...card, tags: [], favorite: false };
    // vCard 4.0 phone numbers as URIs.
    contact.points = card.points.map((p) =>
      p.kind === 'phone' ? { ...p, value: p.value.replace(/^tel:/i, '') } : p,
    );
    // Categories become tags; everything else stays an extra line for CardDAV.
    contact.extraLines = [];
    for (const line of card.extraLines) {
      const parsed = parseLine(line);
      if (parsed?.name === 'CATEGORIES') {
        contact.tags.push(...parsed.value.split(/(?<!\\),/).map(unescapeText));
      } else if (parsed?.name !== 'VERSION') contact.extraLines.push(line);
    }
    // A company card (iOS "X-ABShowAs:COMPANY", or the name is just the company).
    const fn = [card.firstName, card.lastName].filter(Boolean).join(' ');
    const showAsCompany = card.extraLines.some((l) => /^X-ABSHOWAS:COMPANY$/i.test(l.trim()));
    if (card.organization.length && (showAsCompany || fn === card.organization.join(' '))) {
      Object.assign(contact, { firstName: null, lastName: null, middleName: null, nickname: null });
    }
    const finished = finishContact(contact);
    if (finished) contacts.push(finished);
  }
  return contacts;
}
