import { describe, expect, it } from 'vitest';
import { de } from './locales/de';
import { en } from './locales/en';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('en and de have the same keys', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('de has no empty strings', () => {
    const values = keys(de).map((k) => k.split('.').reduce<unknown>((o, p) => (o as never)[p], de));
    for (const value of values) {
      expect(typeof value).toBe('string');
      expect(value).not.toBe('');
    }
  });
});
