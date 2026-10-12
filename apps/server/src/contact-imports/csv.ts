import type { CsvColumn, CsvField, CsvMapping } from '@app/shared';
import { typeLabel, type CardAddress, type PointKind } from '../dav/vcard';
import { emptyContact, finishContact, type ImportContact } from './contact';

type Locale = 'en' | 'de';
export type CsvTemplate = 'google' | 'outlook' | 'generic';

// Parsing -----------------------------------------------------------------------------

/** The delimiter used in the header line: comma, semicolon (German Excel) or tab. */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char as keyof typeof counts]++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return count > 0 ? best : ',';
}

/** RFC 4180 CSV (quotes, line breaks in quoted fields); empty lines are dropped. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

// Column detection ----------------------------------------------------------------------

const col = (field: CsvField, group?: string | null, label?: string | null): CsvColumn => ({
  field,
  group: group ?? null,
  label: label ?? null,
});

/** Header (lower case) → column, for Outlook (en/de) and common generic names. */
const ALIASES: Record<string, CsvColumn> = {};
const alias = (names: string[], column: CsvColumn) => {
  for (const name of names) ALIASES[name] = column;
};
alias(['first name', 'given name', 'firstname', 'vorname'], col('firstName'));
alias(['middle name', 'additional name', 'weitere vornamen', 'zweiter vorname'], col('middleName'));
alias(['last name', 'family name', 'lastname', 'surname', 'nachname'], col('lastName'));
alias(['name prefix', 'prefix', 'titel'], col('prefix'));
alias(['name suffix', 'suffix', 'namenszusatz'], col('suffix'));
alias(['nickname', 'spitzname'], col('nickname'));
alias(['name', 'full name', 'display name', 'anzeigename', 'vollständiger name'], col('fullName'));
alias(['birthday', 'birthdate', 'date of birth', 'geburtstag', 'geburtsdatum'], col('birthday'));
alias(['notes', 'note', 'notizen', 'notiz'], col('note'));
alias(
  ['company', 'organization', 'organisation', 'organization name', 'firma', 'unternehmen'],
  col('organization'),
);
alias(['department', 'organization department', 'abteilung'], col('department'));
alias(
  ['job title', 'organization title', 'position', 'jobtitel', 'role', 'rolle', 'funktion'],
  col('title'),
);
alias(['labels', 'group membership', 'categories', 'kategorien', 'tags', 'gruppen'], col('tags'));
alias(
  ['e-mail address', 'email address', 'e-mail', 'email', 'e-mail-adresse', 'mail'],
  col('email'),
);
alias(['e-mail 2 address', 'e-mail 2: adresse'], col('email', 'email2'));
alias(['e-mail 3 address', 'e-mail 3: adresse'], col('email', 'email3'));
alias(
  ['mobile phone', 'mobile', 'mobiltelefon', 'handy', 'mobil'],
  col('phone', 'mobile', 'Mobile'),
);
alias(['home phone', 'telefon privat', 'telefon (privat)'], col('phone', 'home', 'Home'));
alias(['home phone 2', 'telefon privat 2'], col('phone', 'home2', 'Home'));
alias(
  ['business phone', 'telefon geschäftlich', 'telefon (geschäftlich)'],
  col('phone', 'work', 'Work'),
);
alias(['business phone 2', 'telefon geschäftlich 2'], col('phone', 'work2', 'Work'));
alias(['other phone', 'weiteres telefon'], col('phone', 'other', 'Other'));
alias(['business fax', 'fax geschäftlich'], col('phone', 'workfax', 'Fax'));
alias(['home fax', 'fax privat'], col('phone', 'homefax', 'Fax'));
alias(
  ['primary phone', 'phone', 'telephone', 'phone number', 'telefon', 'telefonnummer'],
  col('phone'),
);
alias(['web page', 'website', 'webseite', 'homepage', 'url', 'personal web page'], col('url'));
for (const [prefix, group, label] of [
  ['home', 'homeaddress', 'Home'],
  ['business', 'workaddress', 'Work'],
  ['other', 'otheraddress', 'Other'],
] as const) {
  alias([`${prefix} street`], col('street', group, label));
  alias([`${prefix} city`], col('city', group, label));
  alias([`${prefix} state`], col('region', group, label));
  alias([`${prefix} postal code`], col('zip', group, label));
  alias([`${prefix} country/region`, `${prefix} country`], col('country', group, label));
}
for (const [suffix, group, label] of [
  ['privat', 'homeaddress', 'Home'],
  ['geschäftlich', 'workaddress', 'Work'],
  ['andere', 'otheraddress', 'Other'],
] as const) {
  alias([`straße ${suffix}`], col('street', group, label));
  alias([`ort ${suffix}`], col('city', group, label));
  alias([`bundesland/kanton ${suffix}`], col('region', group, label));
  alias([`postleitzahl ${suffix}`], col('zip', group, label));
  alias([`land/region ${suffix}`], col('country', group, label));
}
alias(['street', 'address', 'straße', 'strasse', 'adresse'], col('street', 'address'));
alias(['city', 'ort', 'stadt'], col('city', 'address'));
alias(['zip', 'postal code', 'postcode', 'plz', 'postleitzahl'], col('zip', 'address'));
alias(['state', 'region', 'bundesland'], col('region', 'address'));
alias(['country', 'land'], col('country', 'address'));

/** Google: "E-mail 1 - Value", "Phone 2 - Label", "Address 1 - Postal Code", … */
const GOOGLE = /^(e-mail|phone|website|address|organization) (\d+) - (.+)$/;
const GOOGLE_ADDRESS: Record<string, CsvField> = {
  street: 'street',
  city: 'city',
  region: 'region',
  'postal code': 'zip',
  country: 'country',
};

function googleColumn(header: string): CsvColumn | undefined {
  const match = GOOGLE.exec(header);
  if (!match) return undefined;
  const [, kind, n, part] = match as unknown as [string, string, string, string];
  const group = `${kind}${n}`;
  if (kind === 'organization') {
    if (n !== '1') return null;
    return part === 'name'
      ? col('organization')
      : part === 'title'
        ? col('title')
        : part === 'department'
          ? col('department')
          : null;
  }
  if (part === 'label' || part === 'type') return col('label', group);
  if (kind === 'address') return GOOGLE_ADDRESS[part] ? col(GOOGLE_ADDRESS[part], group) : null;
  if (part !== 'value') return null;
  return col(kind === 'e-mail' ? 'email' : kind === 'phone' ? 'phone' : 'url', group);
}

/** Detects the column mapping from the header line (Google, Outlook or generic). */
export function detectMapping(headers: string[]): { template: CsvTemplate; mapping: CsvMapping } {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const google = lower.some((h) => GOOGLE.test(h));
  const outlook =
    !google &&
    lower.some((h) =>
      [
        'e-mail address',
        'business phone',
        'mobile phone',
        'e-mail-adresse',
        'mobiltelefon',
      ].includes(h),
    );
  // Outlook's "Title" is Mr./Dr.; elsewhere it is usually the job title.
  const titleIsPrefix = lower.includes('job title');
  const mapping = lower.map((h) => {
    if (h === 'title') return titleIsPrefix ? col('prefix') : col('title');
    return googleColumn(h) ?? ALIASES[h] ?? null;
  });
  return { template: google ? 'google' : outlook ? 'outlook' : 'generic', mapping };
}

// Values ------------------------------------------------------------------------------------

const LABEL_TYPES: Record<string, string> = {
  mobile: 'CELL',
  cell: 'CELL',
  mobil: 'CELL',
  handy: 'CELL',
  home: 'HOME',
  privat: 'HOME',
  private: 'HOME',
  zuhause: 'HOME',
  work: 'WORK',
  arbeit: 'WORK',
  dienstlich: 'WORK',
  business: 'WORK',
  büro: 'WORK',
  geschäftlich: 'WORK',
  main: 'MAIN',
  zentrale: 'MAIN',
  other: 'OTHER',
  andere: 'OTHER',
  fax: 'FAX',
  'work fax': 'FAX',
  'home fax': 'FAX',
  iphone: 'IPHONE',
};

/** "* Home", "Mobile", "Work" → the app's label in the user's language. */
export function normalizeLabel(raw: string | null | undefined, locale: Locale): string | null {
  const label = raw?.replace(/^\*\s*/, '').trim();
  if (!label) return null;
  const type = LABEL_TYPES[label.toLowerCase()];
  return (type && typeLabel(type, locale)) || label;
}

/**
 * Birthday from CSV: `1985-10-24`, `--10-24`, `24.10.1985`, `24.10.`, `10/24/1985`
 * (US order, as Outlook writes it). Placeholders like `0.0.00` give null.
 */
export function parseLooseDate(raw: string): string | null {
  const value = raw.trim();
  const pad = (n: string) => n.padStart(2, '0');
  const valid = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const year = (y: string) => (y.length === 4 ? y : null);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (match && valid(+match[2]!, +match[3]!))
    return `${match[1]}-${pad(match[2]!)}-${pad(match[3]!)}`;
  match = /^--(\d{2})-?(\d{2})$/.exec(value);
  if (match && valid(+match[1]!, +match[2]!)) return `--${match[1]}-${match[2]}`;
  match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(value);
  if (match && valid(+match[2]!, +match[1]!)) {
    const y = match[3] ? year(match[3]) : null;
    return y ? `${y}-${pad(match[2]!)}-${pad(match[1]!)}` : `--${pad(match[2]!)}-${pad(match[1]!)}`;
  }
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match && valid(+match[1]!, +match[2]!))
    return `${match[3]}-${pad(match[1]!)}-${pad(match[2]!)}`;
  return null;
}

/** Google separates several values in one cell with " ::: ". */
const splitMulti = (value: string) =>
  value
    .split(' ::: ')
    .map((v) => v.trim())
    .filter(Boolean);

const ADDRESS_FIELDS = new Set<CsvField>(['street', 'zip', 'city', 'region', 'country']);
const POINT_FIELDS: Partial<Record<CsvField, PointKind>> = {
  email: 'email',
  phone: 'phone',
  url: 'url',
};

type NameField = 'prefix' | 'firstName' | 'middleName' | 'lastName' | 'suffix' | 'nickname';

interface Group {
  kind?: PointKind | 'address';
  values: string[];
  address: Omit<CardAddress, 'label'>;
  label: string | null;
}

/** Turns CSV rows (without the header) into contacts, using the column mapping. */
export function csvContacts(
  rows: string[][],
  mapping: CsvMapping,
  locale: Locale,
): ImportContact[] {
  const contacts: ImportContact[] = [];
  for (const row of rows) {
    const c = emptyContact();
    const groups = new Map<string, Group>();
    const extra: { fullName?: string; organization?: string; department?: string } = {};
    const group = (key: string) => {
      if (!groups.has(key))
        groups.set(key, {
          values: [],
          address: { street: null, zip: null, city: null, region: null, country: null },
          label: null,
        });
      return groups.get(key)!;
    };

    mapping.forEach((column, i) => {
      const value = row[i]?.trim();
      if (!column || !value) return;
      const key = column.group ?? `column${i}`;
      const f = column.field;
      if (POINT_FIELDS[f]) {
        const g = group(key);
        g.kind = POINT_FIELDS[f];
        g.values.push(...splitMulti(value));
        g.label ??= column.label ?? null;
      } else if (ADDRESS_FIELDS.has(f)) {
        const g = group(column.group ?? 'address');
        g.kind = 'address';
        const part = f as keyof Group['address'];
        g.address[part] = g.address[part] ? `${g.address[part]} ${value}` : value;
        g.label ??= column.label ?? null;
      } else if (f === 'label') {
        group(key).label = value;
      } else if (f === 'tags') {
        for (const tag of value.split(/ ::: |[,;]/).map((t) => t.replace(/^\*\s*/, '').trim())) {
          if (/^starred$/i.test(tag)) c.favorite = true;
          else if (tag && !/^mycontacts$/i.test(tag)) c.tags.push(tag);
        }
      } else if (f === 'birthday') c.birthday = parseLooseDate(value);
      else if (f === 'note') c.note = c.note ? `${c.note}\n${value}` : value;
      else if (f === 'fullName') extra.fullName = value;
      else if (f === 'organization') extra.organization = value;
      else if (f === 'department') extra.department = value;
      else if (f === 'title') c.title = value;
      else {
        const name = f as NameField;
        c[name] = c[name] ? `${c[name]} ${value}` : value;
      }
    });

    if (!c.firstName && !c.lastName && !c.nickname && extra.fullName) {
      const words = extra.fullName.split(/\s+/);
      c.firstName = words.length > 1 ? words.slice(0, -1).join(' ') : words[0]!;
      c.lastName = words.length > 1 ? words.at(-1)! : null;
    }
    c.organization = [extra.organization, extra.department].filter((p): p is string => !!p);
    for (const g of groups.values()) {
      const label = normalizeLabel(g.label, locale);
      if (g.kind === 'address') {
        c.addresses.push({ label, ...g.address });
      } else if (g.kind) {
        for (const value of g.values) {
          c.points.push({ kind: g.kind, label, value, isPrimary: false });
        }
      }
    }
    const finished = finishContact(c);
    if (finished) contacts.push(finished);
  }
  return contacts;
}

/** Header, first rows and contacts of a CSV file; `mapping` overrides the detection. */
export function readCsv(text: string, locale: Locale, mapping?: CsvMapping) {
  const [headers = [], ...rows] = parseCsv(text);
  const detected = detectMapping(headers);
  const used = mapping ?? detected.mapping;
  return {
    template: detected.template,
    headers,
    samples: rows.slice(0, 3),
    mapping: used,
    contacts: csvContacts(rows, used, locale),
  };
}
