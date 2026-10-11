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

/**
 * "Dr. Jana (Jani) Maria Berger": the nickname follows the first name in brackets.
 * Without a first name the nickname stands alone; empty if nothing is set.
 */
export function personDisplayName(p: NameParts): string {
  const nickname = p.nickname?.trim();
  const first = p.firstName?.trim();
  const firstWithNickname =
    first && nickname && nickname.toLowerCase() !== first.toLowerCase()
      ? `${first} (${nickname})`
      : first || nickname;
  return join(p.prefix, firstWithNickname, p.middleName, p.lastName, p.suffix);
}

/** Sort key: last name first. */
export function personSortName(p: NameParts): string {
  return join(p.lastName, p.firstName, p.middleName) || p.nickname?.trim() || '';
}

/** Initials for the avatar: first letters of first and last name. */
export function personInitials(p: NameParts): string {
  const first = (p.firstName || p.nickname || p.lastName || '').trim();
  const last = p.firstName ? (p.lastName ?? '').trim() : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
