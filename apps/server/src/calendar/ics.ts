/** Minimal iCalendar (RFC 5545) writer for read-only subscriptions. */

const escape = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Lines longer than 75 octets continue after CRLF + space (UTF-8 safe). */
function fold(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
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
      limit = 74;
    }
    current += char;
    size += length;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** `2026-10-24` → `20261024`. */
const icsDate = (date: string) => date.replaceAll('-', '');

const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export interface AllDayEvent {
  uid: string;
  /** `YYYY-MM-DD`. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  /** Repeats every year (birthdays). */
  yearly?: boolean;
  updatedAt: string;
}

export function buildCalendar(name: string, events: AllDayEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personengedaechtnis//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escape(event.uid)}`,
      `DTSTAMP:${stamp(event.updatedAt)}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(event.date))}`,
      ...(event.yearly ? ['RRULE:FREQ=YEARLY'] : []),
      `SUMMARY:${escape(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
      ...(event.url ? [`URL;VALUE=URI:${event.url}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
