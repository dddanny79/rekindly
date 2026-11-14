/**
 * Folds text for matching: lower case, accents removed, German umlauts and their
 * transliterations unified, so "Müller", "Mueller" and "Muller" all become "muller".
 * Applied to both the stored text and the query.
 */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

const foldedWords = (value: string) =>
  foldText(value)
    .split(/[\s,]+/)
    .filter(Boolean);

/**
 * Every word of the query occurs in the text, in any order and folded like `foldText`:
 * "jana berger" finds "Berger, Jana".
 */
export function containsWords(text: string, query: string): boolean {
  const haystack = foldText(text);
  return foldedWords(query).every((word) => haystack.includes(word));
}

/** The same words, ignoring order and commas: "Berger, Jana" = "jana berger". */
export const sameWords = (a: string, b: string) =>
  foldedWords(a).sort().join(' ') === foldedWords(b).sort().join(' ');

/** Folds a single character (no ae/oe/ue collapsing); see `foldText`. */
function foldChar(char: string): string {
  return char
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[äöü]/g, (c) => ({ ä: 'a', ö: 'o', ü: 'u' })[c]!)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * `foldText` that also remembers, for every folded character, the range of the
 * original text it came from — to highlight a match found in folded text.
 * `folded` equals `foldText(value)` for Latin text.
 */
export function foldWithMap(value: string): { folded: string; starts: number[]; ends: number[] } {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of value) {
    for (const out of foldChar(char)) {
      chars.push(out);
      starts.push(index);
      ends.push(index + char.length);
    }
    index += char.length;
  }
  // ae → a, oe → o, ue → u, left to right like the replacements in foldText.
  const result = { folded: '', starts: [] as number[], ends: [] as number[] };
  for (let i = 0; i < chars.length; i++) {
    const merge = 'aou'.includes(chars[i]!) && chars[i + 1] === 'e';
    result.folded += chars[i];
    result.starts.push(starts[i]!);
    result.ends.push(ends[merge ? i + 1 : i]!);
    if (merge) i++;
  }
  return result;
}

export interface NameParts {
  prefix?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  nickname?: string | null;
}

const join = (...parts: (string | null | undefined)[]) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

/** How names are written: "Jana Berger" or "Berger, Jana". */
export const NAME_DISPLAY_ORDERS = ['firstLast', 'lastFirst'] as const;
export type NameDisplayOrder = (typeof NAME_DISPLAY_ORDERS)[number];

/** How people are sorted by name: by last name or by first name. */
export const NAME_SORT_ORDERS = ['lastName', 'firstName'] as const;
export type NameSortOrder = (typeof NAME_SORT_ORDERS)[number];

/** The instance's name settings; the defaults keep the original behaviour. */
export interface NameFormat {
  displayOrder: NameDisplayOrder;
  sortOrder: NameSortOrder;
}
export const DEFAULT_NAME_FORMAT: NameFormat = { displayOrder: 'firstLast', sortOrder: 'lastName' };

/**
 * "Dr. Jana (Jani) Maria Berger", or with `lastFirst` "Berger, Dr. Jana (Jani) Maria":
 * the nickname follows the first name in brackets. Without a first name the nickname
 * stands alone. A name without a first and a last part is written the same either way.
 * Empty if nothing is set.
 */
export function personDisplayName(p: NameParts, order: NameDisplayOrder = 'firstLast'): string {
  const nickname = p.nickname?.trim();
  const first = p.firstName?.trim();
  const firstWithNickname =
    first && nickname && nickname.toLowerCase() !== first.toLowerCase()
      ? `${first} (${nickname})`
      : first || nickname;
  const last = p.lastName?.trim();
  const given = join(firstWithNickname, p.middleName);
  if (order === 'lastFirst' && last && given) {
    const suffix = p.suffix?.trim();
    return `${last}, ${join(p.prefix, given)}${suffix ? `, ${suffix}` : ''}`;
  }
  return join(p.prefix, firstWithNickname, p.middleName, p.lastName, p.suffix);
}

/** Sort key: last name first, or first name first. */
export function personSortName(p: NameParts, order: NameSortOrder = 'lastName'): string {
  const first = p.firstName?.trim() || p.nickname?.trim();
  return order === 'firstName'
    ? join(first, p.middleName, p.lastName)
    : join(p.lastName, p.firstName, p.middleName) || p.nickname?.trim() || '';
}

/** Initials for the avatar: first letters of first and last name. */
export function personInitials(p: NameParts): string {
  const first = (p.firstName || p.nickname || p.lastName || '').trim();
  const last = p.firstName ? (p.lastName ?? '').trim() : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
