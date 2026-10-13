import type { PersonDateKind } from './schemas/people';

/** Names of the kinds of recurring days, for texts the server writes (vCard, ICS, mail). */
export const PERSON_DATE_LABELS: Record<'en' | 'de', Record<PersonDateKind, string>> = {
  en: {
    wedding: 'Wedding anniversary',
    anniversary: 'Anniversary',
    memorial: 'Anniversary of death',
    nameday: 'Name day',
    met: 'Day we met',
    custom: 'Day',
  },
  de: {
    wedding: 'Hochzeitstag',
    anniversary: 'Jahrestag',
    memorial: 'Todestag',
    nameday: 'Namenstag',
    met: 'Kennengelernt',
    custom: 'Tag',
  },
};

/** The name of a day: its own label, or the name of its kind. */
export const personDateLabel = (
  day: { kind: PersonDateKind; label: string | null },
  locale: 'en' | 'de',
) => day.label ?? PERSON_DATE_LABELS[locale][day.kind];

/**
 * Full years on `on` (`YYYY-MM-DD`) since a day with a known year; null without a
 * year and for name days, which are not counted.
 */
export function personDateYears(
  day: { kind: PersonDateKind; date: string },
  on: string,
): number | null {
  if (day.kind === 'nameday' || day.date.startsWith('--')) return null;
  const years = Number(on.slice(0, 4)) - Number(day.date.slice(0, 4));
  return years > 0 ? years : null;
}
