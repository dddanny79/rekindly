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

/** `YYYY-MM-DD` / `--MM-DD` as typed: "24.10.1985" / "24.10." (what parseBirthday reads). */
export function birthdayInput(value: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.replace(/^--/, '-').split('-');
  return `${Number(d)}.${Number(m)}.${y ? y : ''}`;
}

/** `YYYY`, `YYYY-MM`, `YYYY-MM-DD` as typed: "2017", "3/2026", "2.10.2026". */
export function partialDateInput(value: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-');
  if (!m) return y!;
  if (!d) return `${Number(m)}/${y}`;
  return `${Number(d)}.${Number(m)}.${y}`;
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

/** Local calendar date as `YYYY-MM-DD`. */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` as a local date at midnight. */
export function fromDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days from `today` to `date` (negative = in the past), by calendar date. */
export function daysUntil(date: Date, today = new Date()): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Follow-up offsets typed as "3d", "2w", "1m" or a date "25.10." / "25.10.2026". */
export function parseDueInput(input: string, today = new Date()): string | null {
  const value = input.trim().toLowerCase();
  const relative = /^(\d{1,3})\s*([dtwm])$/.exec(value);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2];
    if (unit === 'm') {
      const next = new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
      return toDateOnly(next);
    }
    return toDateOnly(addDays(today, unit === 'w' ? n * 7 : n));
  }
  const date = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(value);
  if (date) {
    const [, d, m, y] = date;
    const year = y ? Number(y) : today.getFullYear();
    let candidate = new Date(year, Number(m) - 1, Number(d));
    if (!y && daysUntil(candidate, today) < 0)
      candidate = new Date(year + 1, Number(m) - 1, Number(d));
    return candidate.getMonth() === Number(m) - 1 ? toDateOnly(candidate) : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

/**
 * Contact rhythm state: due date and whether it is overdue. Without any contact
 * yet, the rhythm counts from the day it was set (`since`).
 */
export function rhythmStatus(
  contactEveryDays: number | null,
  lastContactAt: string | null,
  today = new Date(),
  since: string | null = null,
) {
  if (!contactEveryDays) return null;
  const base = lastContactAt ?? since;
  if (!base) return { due: null, overdueDays: null, neverContacted: !lastContactAt };
  const due = addDays(new Date(base), contactEveryDays);
  const days = daysUntil(due, today);
  return { due, overdueDays: days < 0 ? -days : 0, neverContacted: !lastContactAt };
}

/** Value for `<input type="datetime-local">` in local time. */
export function toDateTimeLocal(date: Date): string {
  return `${toDateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
