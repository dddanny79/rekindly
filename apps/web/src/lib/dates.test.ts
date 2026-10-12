import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatBirthday,
  nextBirthday,
  parseBirthday,
  parseDueInput,
  parsePartialDate,
  rhythmStatus,
} from './dates';

describe('dates', () => {
  it('parses birthdays as people type them', () => {
    expect(parseBirthday('24.10.')).toBe('--10-24');
    expect(parseBirthday('4.3.1985')).toBe('1985-03-04');
    expect(parseBirthday('1985-03-04')).toBe('1985-03-04');
    expect(parseBirthday('')).toBeNull();
    expect(parseBirthday('31.02.')).toBeUndefined();
    expect(parseBirthday('morgen')).toBeUndefined();
  });

  it('formats birthdays with and without year', () => {
    expect(formatBirthday('--10-24', 'de')).toBe('24. Oktober');
    expect(formatBirthday('1985-10-24', 'en')).toBe('October 24, 1985');
  });

  it('computes the next birthday', () => {
    const today = new Date(2026, 9, 11);
    expect(nextBirthday('1979-10-24', today)).toEqual({ days: 13, turns: 47 });
    expect(nextBirthday('--10-11', today)).toEqual({ days: 0, turns: null });
    expect(nextBirthday('--01-01', today).days).toBe(82);
  });

  it('parses partial dates', () => {
    expect(parsePartialDate('2017')).toBe('2017');
    expect(parsePartialDate('3/2026')).toBe('2026-03');
    expect(parsePartialDate('2.10.2026')).toBe('2026-10-02');
    expect(parsePartialDate('irgendwann')).toBeUndefined();
  });
});

describe('follow-up dates', () => {
  const today = new Date(2026, 9, 11);

  it('parses relative and absolute due dates', () => {
    expect(parseDueInput('2w', today)).toBe('2026-10-25');
    expect(parseDueInput('3d', today)).toBe('2026-10-14');
    expect(parseDueInput('1m', today)).toBe('2026-11-11');
    expect(parseDueInput('25.10.', today)).toBe('2026-10-25');
    expect(parseDueInput('1.2.', today)).toBe('2027-02-01');
    expect(parseDueInput('31.02.', today)).toBeNull();
    expect(parseDueInput('bald', today)).toBeNull();
  });

  it('computes the contact rhythm', () => {
    expect(rhythmStatus(null, null, today)).toBeNull();
    expect(rhythmStatus(21, null, today)).toMatchObject({ neverContacted: true });
    const ok = rhythmStatus(21, new Date(2026, 9, 2, 14).toISOString(), today)!;
    expect(ok.overdueDays).toBe(0);
    expect(daysUntil(ok.due!, today)).toBe(12);
    expect(rhythmStatus(30, new Date(2026, 7, 1).toISOString(), today)!.overdueDays).toBe(41);
  });
});
