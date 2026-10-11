import { describe, expect, it } from 'vitest';
import { formatBirthday, nextBirthday, parseBirthday, parsePartialDate } from './dates';

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
