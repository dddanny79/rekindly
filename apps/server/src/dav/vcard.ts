/**
 * vCard 3.0 as iOS Contacts reads and writes it (RFC 2426 plus Apple's
 * conventions: `itemN.X-ABLabel` for custom labels, `X-APPLE-OMIT-YEAR` for
 * birthdays without a year). Pure functions, no database access.
 */

export type PointKind = 'phone' | 'email' | 'url' | 'messenger' | 'social';

export interface CardPoint {
  kind: PointKind;
  label: string | null;
  value: string;
  isPrimary: boolean;
}

export interface CardAddress {
  label: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

/** What the app knows about a person, in vCard terms. */
export interface CardData {
  uid: string;
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  nickname: string | null;
  /** `YYYY-MM-DD` or `--MM-DD`. */
  birthday: string | null;
  /** Organization path from the top, e.g. ["Beispiel GmbH", "Standort Köln"]. */
  organization: string[];
  title: string | null;
  note: string | null;
  points: CardPoint[];
  addresses: CardAddress[];
}

export interface VcardLine {
  group: string | null;
  name: string;
  params: Record<string, string[]>;
  value: string;
}

// Escaping and folding -----------------------------------------------------------------

export const escapeText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

export function unescapeText(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_, char: string) =>
    char === 'n' || char === 'N' ? '\n' : char,
  );
}

/** Splits a structured value (N, ADR, ORG) at unescaped semicolons. */
function splitStructured(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === '\\' && i + 1 < value.length) {
      current += char + value[i + 1];
      i++;
    } else if (char === ';') {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts.map(unescapeText);
}

/** Lines longer than 75 octets continue on the next line after a space (UTF-8 safe). */
export function foldLine(line: string): string {
  const bytes = Buffer.byteLength(line);
  if (bytes <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const length = Buffer.byteLength(char);
    if (size + length > limit) {
      out.push(current);
      current = '';
      size = 0;
      limit = 74; // the leading space counts
    }
    current += char;
    size += length;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Joins folded lines (CRLF or LF followed by a space or tab). */
export function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

/** `item1.TEL;type=CELL;type=pref:+49 …` → parts. Lower-case `type` lists are split. */
export function parseLine(line: string): VcardLine | null {
  // The value starts at the first colon outside quotes.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [head, ...paramParts] = line.slice(0, colon).split(';');
  const dot = head!.indexOf('.');
  const group = dot > 0 ? head!.slice(0, dot) : null;
  const name = (dot > 0 ? head!.slice(dot + 1) : head!).toUpperCase();
  const params: Record<string, string[]> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    // vCard 2.1 style `TEL;CELL` means `TYPE=CELL`.
    const key = eq < 0 ? 'TYPE' : part.slice(0, eq).toUpperCase();
    const raw = eq < 0 ? part : part.slice(eq + 1);
    const values = raw.split(',').map((v) => v.replace(/^"|"$/g, ''));
    params[key] = [...(params[key] ?? []), ...values];
  }
  return { group, name, params, value: line.slice(colon + 1) };
}

// Labels ---------------------------------------------------------------------------------

type Standard = 'CELL' | 'WORK' | 'HOME' | 'IPHONE' | 'MAIN' | 'FAX';

/** Free-text labels of the app (en/de) that iOS has a standard type for. */
const LABEL_TYPES: Record<string, Standard> = {
  mobile: 'CELL',
  mobil: 'CELL',
  handy: 'CELL',
  cell: 'CELL',
  work: 'WORK',
  büro: 'WORK',
  buero: 'WORK',
  arbeit: 'WORK',
  dienstlich: 'WORK',
  home: 'HOME',
  privat: 'HOME',
  private: 'HOME',
  zuhause: 'HOME',
  iphone: 'IPHONE',
  main: 'MAIN',
  zentrale: 'MAIN',
  fax: 'FAX',
};

/** Apple's built-in labels (`_$!<Home>!$_`) and the type they stand for. */
const APPLE_LABEL_TYPES: Record<string, string> = {
  Mobile: 'CELL',
  iPhone: 'IPHONE',
  Home: 'HOME',
  Work: 'WORK',
  Main: 'MAIN',
  HomeFAX: 'FAX',
  WorkFAX: 'FAX',
  Other: 'OTHER',
};

const TYPE_LABELS: Record<'en' | 'de', Record<string, string>> = {
  en: {
    CELL: 'Mobile',
    WORK: 'Work',
    HOME: 'Home',
    IPHONE: 'iPhone',
    MAIN: 'Main',
    FAX: 'Fax',
    OTHER: 'Other',
  },
  de: {
    CELL: 'Mobil',
    WORK: 'Büro',
    HOME: 'Privat',
    IPHONE: 'iPhone',
    MAIN: 'Zentrale',
    FAX: 'Fax',
  },
};

/** The app's label for a standard type (`CELL` → "Mobile" / "Mobil"); null if none. */
export const typeLabel = (type: string, locale: 'en' | 'de') =>
  TYPE_LABELS[locale][type] ?? (type === 'OTHER' ? (locale === 'de' ? 'Andere' : 'Other') : null);

/** `_$!<Mobile>!$_` (Apple's built-in label) → `Mobile`. */
const appleLabel = (label: string) => label.replace(/^_\$!<(.*)>!\$_$/, '$1');

// Building --------------------------------------------------------------------------------

const PRODID = '-//Personengedaechtnis//CardDAV//EN';

class Builder {
  private lines: string[] = [];
  private item = 0;

  add(name: string, value: string, params: string[] = [], group?: string) {
    const head = [group ? `${group}.${name}` : name, ...params].join(';');
    this.lines.push(`${head}:${value}`);
  }

  /** A property with a custom label: `itemN.NAME` + `itemN.X-ABLabel`. */
  labelled(name: string, value: string, label: string, params: string[] = []) {
    const group = `item${++this.item}`;
    this.add(name, value, params, group);
    this.add('X-ABLabel', escapeText(label), [], group);
  }

  raw(line: string) {
    this.lines.push(line);
  }

  text() {
    return `${this.lines.map(foldLine).join('\r\n')}\r\n`;
  }
}

function typed(
  builder: Builder,
  name: string,
  value: string,
  label: string | null,
  extra: string[],
  pref: boolean,
) {
  const standard = label ? LABEL_TYPES[label.trim().toLowerCase()] : undefined;
  const types = [...extra, ...(standard ? [standard] : []), ...(pref ? ['pref'] : [])];
  const params = types.length ? [`type=${types.join(',')}`] : [];
  if (label && !standard) builder.labelled(name, value, label, params);
  else builder.add(name, value, params);
}

/**
 * The vCard of a person. `extraLines` are lines a client sent that the app has no
 * field for; `link` is the deep link to the person page; `photo` a JPEG.
 */
export function buildVcard(
  card: CardData,
  options: { extraLines?: string[]; link?: { url: string; label: string }; photo?: Buffer } = {},
): string {
  const b = new Builder();
  b.raw('BEGIN:VCARD');
  b.raw('VERSION:3.0');
  b.raw(`PRODID:${PRODID}`);
  b.add('UID', escapeText(card.uid));
  const parts = [card.lastName, card.firstName, card.middleName, card.prefix, card.suffix];
  b.add('N', parts.map((p) => escapeText(p ?? '')).join(';'));
  const fn = [card.prefix, card.firstName, card.middleName, card.lastName, card.suffix]
    .filter((p) => p?.trim())
    .join(' ');
  b.add('FN', escapeText(fn || card.nickname || ''));
  if (card.nickname) b.add('NICKNAME', escapeText(card.nickname));
  if (card.birthday) {
    if (card.birthday.startsWith('--')) {
      // iOS: a placeholder year plus X-APPLE-OMIT-YEAR shows the day without an age.
      b.add('BDAY', `1604-${card.birthday.slice(2)}`, ['X-APPLE-OMIT-YEAR=1604']);
    } else b.add('BDAY', card.birthday, ['VALUE=date']);
  }
  if (card.organization.length) b.add('ORG', card.organization.map(escapeText).join(';'));
  if (card.title) b.add('TITLE', escapeText(card.title));
  if (card.note) b.add('NOTE', escapeText(card.note));

  for (const point of card.points) {
    const value = escapeText(point.value);
    switch (point.kind) {
      case 'phone':
        typed(b, 'TEL', value, point.label, [], point.isPrimary);
        break;
      case 'email':
        typed(b, 'EMAIL', value, point.label, ['INTERNET'], point.isPrimary);
        break;
      case 'url':
        typed(b, 'URL', value, point.label, [], point.isPrimary);
        break;
      default:
        // Messenger and social profiles: iOS shows them as social profiles.
        b.add('X-SOCIALPROFILE', value, [`type=${escapeText(point.label ?? point.kind)}`]);
    }
  }
  for (const a of card.addresses) {
    const value = ['', '', a.street, a.city, a.region, a.zip, a.country]
      .map((p) => escapeText(p ?? ''))
      .join(';');
    typed(b, 'ADR', value, a.label, [], false);
  }
  if (options.link) b.labelled('URL', options.link.url, options.link.label);
  if (options.photo) {
    b.add('PHOTO', options.photo.toString('base64'), ['ENCODING=b', 'TYPE=JPEG']);
  }
  for (const line of regroupExtras(options.extraLines ?? [])) b.raw(line);
  b.raw('END:VCARD');
  return b.text();
}

// Parsing ---------------------------------------------------------------------------------

export interface ParsedCard extends Omit<CardData, 'uid'> {
  uid: string | null;
  photo: Buffer | null;
  /** Lines without a field in the app, to be written back unchanged. */
  extraLines: string[];
}

/** Properties the app maps; everything else is kept as an extra line. */
const KNOWN = new Set([
  'BEGIN',
  'END',
  'VERSION',
  'PRODID',
  'UID',
  'N',
  'FN',
  'NICKNAME',
  'BDAY',
  'ORG',
  'TITLE',
  'NOTE',
  'TEL',
  'EMAIL',
  'URL',
  'ADR',
  'PHOTO',
  'REV',
  'X-SOCIALPROFILE',
]);

const nullable = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : null;
};

/** `1985-10-24`, `19851024`, `--1024`, `--10-24`, `1604-10-24` (+ omit year) → app format. */
const APPLE_NO_YEAR = '1604';

export function parseBirthday(line: VcardLine): string | null {
  const value = line.value.trim().replace(/T.*$/, '');
  const omit = line.params['X-APPLE-OMIT-YEAR']?.[0];
  let match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (match) {
    const [, y, m, d] = match;
    // 1604 is Apple's placeholder for "no year"; iOS does not always send the
    // X-APPLE-OMIT-YEAR parameter back, and nobody alive was born in 1604.
    const yearless = (omit && y === omit) || y === APPLE_NO_YEAR;
    return yearless ? `--${m}-${d}` : `${y}-${m}-${d}`;
  }
  match = /^--(\d{2})-?(\d{2})$/.exec(value);
  return match ? `--${match[1]}-${match[2]}` : null;
}

function labelFor(
  line: VcardLine,
  groupLabels: Map<string, string>,
  locale: 'en' | 'de',
): string | null {
  if (line.group && groupLabels.has(line.group)) {
    const raw = groupLabels.get(line.group)!;
    const builtIn = /^_\$!<(.*)>!\$_$/.exec(raw)?.[1];
    const type = builtIn ? APPLE_LABEL_TYPES[builtIn] : undefined;
    return type ? (TYPE_LABELS[locale][type] ?? builtIn!) : appleLabel(raw);
  }
  const types = (line.params.TYPE ?? []).map((t) => t.toUpperCase());
  for (const type of ['IPHONE', 'CELL', 'WORK', 'HOME', 'MAIN', 'FAX']) {
    if (types.includes(type)) return TYPE_LABELS[locale][type] ?? null;
  }
  return null;
}

const isPref = (line: VcardLine) =>
  (line.params.TYPE ?? []).some((t) => t.toLowerCase() === 'pref') || !!line.params.PREF;

/**
 * Reads a vCard (3.0, also 4.0 basics). `locale` decides the labels for iOS's
 * standard types; `isOwnLink` recognizes the deep link the app wrote itself.
 */
export function parseVcard(
  text: string,
  options: { locale: 'en' | 'de'; isOwnLink?: (url: string) => boolean },
): ParsedCard {
  const raw = unfold(text);
  const lines = raw.map((l) => [l, parseLine(l)] as const);
  const groupLabels = new Map<string, string>();
  const knownGroups = new Set<string>();
  for (const [, line] of lines) {
    if (!line) continue;
    if (line.name === 'X-ABLABEL' && line.group)
      groupLabels.set(line.group, unescapeText(line.value));
    else if (line.group && KNOWN.has(line.name)) knownGroups.add(line.group);
  }

  const card: ParsedCard = {
    uid: null,
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
    photo: null,
    extraLines: [],
  };
  let fn: string | null = null;

  for (const [text, line] of lines) {
    if (!line) continue;
    const value = line.value;
    const label = () => labelFor(line, groupLabels, options.locale);
    switch (line.name) {
      case 'UID':
        card.uid = nullable(unescapeText(value));
        break;
      case 'N': {
        const [last, first, middle, prefix, suffix] = splitStructured(value);
        card.lastName = nullable(last);
        card.firstName = nullable(first);
        card.middleName = nullable(middle);
        card.prefix = nullable(prefix);
        card.suffix = nullable(suffix);
        break;
      }
      case 'FN':
        fn = nullable(unescapeText(value));
        break;
      case 'NICKNAME':
        card.nickname = nullable(unescapeText(value).split(',')[0]);
        break;
      case 'BDAY':
        card.birthday = parseBirthday(line);
        break;
      case 'ORG':
        card.organization = splitStructured(value)
          .map((p) => p.trim())
          .filter(Boolean);
        break;
      case 'TITLE':
        card.title = nullable(unescapeText(value));
        break;
      case 'NOTE':
        card.note = nullable(unescapeText(value));
        break;
      case 'TEL':
        card.points.push({
          kind: 'phone',
          label: label(),
          value: unescapeText(value).trim(),
          isPrimary: isPref(line),
        });
        break;
      case 'EMAIL':
        card.points.push({
          kind: 'email',
          label: label(),
          value: unescapeText(value).trim(),
          isPrimary: isPref(line),
        });
        break;
      case 'URL': {
        const url = unescapeText(value).trim();
        if (options.isOwnLink?.(url)) break;
        card.points.push({ kind: 'url', label: label(), value: url, isPrimary: isPref(line) });
        break;
      }
      case 'X-SOCIALPROFILE': {
        const type = line.params.TYPE?.[0] ?? null;
        card.points.push({
          kind: 'social',
          label: type && type !== 'social' ? type : null,
          value: unescapeText(value).trim(),
          isPrimary: false,
        });
        break;
      }
      case 'ADR': {
        const [, , street, city, region, zip, country] = splitStructured(value);
        const address = {
          label: label(),
          street: nullable(street),
          zip: nullable(zip),
          city: nullable(city),
          region: nullable(region),
          country: nullable(country),
        };
        if (address.street || address.zip || address.city || address.region || address.country)
          card.addresses.push(address);
        break;
      }
      case 'PHOTO': {
        const data = value.trim();
        const uri = /^data:[^;]+;base64,(.*)$/s.exec(data);
        if (uri) card.photo = Buffer.from(uri[1]!, 'base64');
        else if (line.params.ENCODING?.some((e) => /^b(ase64)?$/i.test(e)))
          card.photo = Buffer.from(data, 'base64');
        break;
      }
      case 'X-ABLABEL':
        // Belongs to its property; kept only with unknown properties.
        if (line.group && !knownGroups.has(line.group)) card.extraLines.push(text);
        break;
      default:
        if (!KNOWN.has(line.name)) card.extraLines.push(text);
    }
  }

  if (!card.firstName && !card.lastName && !card.nickname && fn) {
    const words = fn.split(/\s+/);
    card.firstName = words.length > 1 ? words.slice(0, -1).join(' ') : words[0]!;
    card.lastName = words.length > 1 ? words.at(-1)! : null;
  }
  return card;
}

/** Gives extra lines group names that cannot collide with the app's `itemN` groups. */
export function regroupExtras(lines: string[]): string[] {
  const names = new Map<string, string>();
  return lines.map((line) => {
    const match = /^([A-Za-z0-9-]+)\.(.*)$/s.exec(line);
    if (!match) return line;
    const [, group, rest] = match;
    if (!names.has(group!)) names.set(group!, `extra${names.size + 1}`);
    return `${names.get(group!)}.${rest}`;
  });
}

/** Adds the deep link and the photo to a stored card (both are not part of the etag). */
export function servedVcard(
  core: string,
  extras: { link?: { url: string; label: string }; photo?: Buffer },
): string {
  const lines: string[] = [];
  if (extras.link) {
    lines.push(foldLine(`applink.URL:${extras.link.url}`));
    lines.push(foldLine(`applink.X-ABLabel:${escapeText(extras.link.label)}`));
  }
  if (extras.photo) {
    lines.push(foldLine(`PHOTO;ENCODING=b;TYPE=JPEG:${extras.photo.toString('base64')}`));
  }
  if (!lines.length) return core;
  return core.replace(/END:VCARD\r\n$/, `${lines.join('\r\n')}\r\nEND:VCARD\r\n`);
}

/**
 * True if two cards carry the same data as far as the app stores it (names,
 * birthday, organization, note, contact points and addresses in any order,
 * kept extra lines, photo present or not).
 */
export function sameContent(
  sent: ParsedCard,
  stored: ParsedCard,
  storedHasPhoto: boolean,
): boolean {
  const key = (c: ParsedCard) =>
    JSON.stringify({
      names: [c.prefix, c.firstName, c.middleName, c.lastName, c.suffix, c.nickname],
      birthday: c.birthday,
      organization: c.organization,
      title: c.title,
      note: c.note,
      points: c.points.map((p) => JSON.stringify(p)).sort(),
      addresses: c.addresses.map((a) => JSON.stringify(a)).sort(),
      // Group names of extra lines are renamed when stored (itemN → extraN).
      extras: c.extraLines.map((l) => l.replace(/^[A-Za-z0-9-]+\./, '')).sort(),
    });
  return !!sent.photo === storedHasPhoto && key(sent) === key(stored);
}
