/** Dates as typed by people: "24.10.", "24.10.1985", "1985-10-24", "--10-24". */
export function parseBirthday(input: string): string | null | undefined {
  const value = input.trim();
  if (value === '') return null;
  if (/^(\d{4}|-)-\d{2}-\d{2}$/.test(value)) return valid(value) ? value : undefined;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(value);
  if (!match) return undefined;
  const [, d, m, y] = match;
  const iso = `${y ?? '-'}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  return valid(iso) ? iso : undefined;
}

function valid(iso: string) {
  const [y, m, d] = iso.replace(/^-/, '2000').split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

/** "24.10.1985" / "24. Okt." style display of `YYYY-MM-DD` or `--MM-DD`. */
export function formatBirthday(value: string, locale: string): string {
  const yearless = value.startsWith('--');
  const [y, m, d] = (yearless ? `2000${value.slice(1)}` : value).split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(yearless ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

/** Age the person turns on their next birthday, if the year is known. */
export function nextBirthday(value: string, today = new Date()) {
  const [, m, d] = value.replace(/^--/, '0000-').split('-').map(Number);
  const year = today.getFullYear();
  let next = new Date(year, m! - 1, d!);
  const startOfToday = new Date(year, today.getMonth(), today.getDate());
  if (next < startOfToday) next = new Date(year + 1, m! - 1, d!);
  const days = Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000);
  const birthYear = value.startsWith('--') ? null : Number(value.slice(0, 4));
  return { days, turns: birthYear ? next.getFullYear() - birthYear : null };
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` for display ("2017", "03/2026", "02.10.2026"). */
export function formatPartialDate(value: string, locale: string): string {
  const [y, m, d] = value.split('-');
  if (!m) return y!;
  if (!d) return locale.startsWith('de') ? `${m}/${y}` : `${m}/${y}`;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

/** Accepts "2017", "3/2026", "03.2026", "2026-03", "2.10.2026", "2026-10-02". */
export function parsePartialDate(input: string): string | null | undefined {
  const value = input.trim();
  if (value === '') return null;
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return value;
  let match = /^(\d{1,2})[./](\d{4})$/.exec(value);
  if (match) return `${match[2]}-${match[1]!.padStart(2, '0')}`;
  match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (match) return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return undefined;
}
