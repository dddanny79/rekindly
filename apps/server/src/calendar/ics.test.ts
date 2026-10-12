import { describe, expect, it } from 'vitest';
import { buildCalendar } from './ics';

describe('ICS', () => {
  it('escapes text, folds long lines and ends all-day events the next day', () => {
    const text = buildCalendar('Test', [
      {
        uid: 'r-1@example.com',
        date: '2026-12-31',
        summary: 'Angebot; Preise, Termin\\Rabatt',
        description: `${'Lang '.repeat(30)}Ende`,
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
    ]);
    const lines = text.split('\r\n');
    expect(lines).toContain(String.raw`SUMMARY:Angebot\; Preise\, Termin\\Rabatt`);
    expect(lines).toContain('DTSTART;VALUE=DATE:20261231');
    expect(lines).toContain('DTEND;VALUE=DATE:20270101');
    expect(lines).toContain('DTSTAMP:20261012T100000Z');
    expect(lines.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
