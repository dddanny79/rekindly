import { describe, expect, it } from 'vitest';
import { findTokenRanges, isSearchable, matchedTokens, searchTokens, snippet } from './search-text';
import { foldText, foldWithMap } from './text';

describe('foldWithMap', () => {
  it('folds like foldText', () => {
    for (const value of [
      'Müller',
      'Mueller',
      'Straße 5',
      'José Núñez',
      'Michael Goebel',
      'AEOEUE quaee',
      'Ærøskøbing',
      'Zoë Saldaña',
    ]) {
      expect(foldWithMap(value).folded).toBe(foldText(value));
    }
  });

  it('maps folded characters back to the original', () => {
    const { folded, starts, ends } = foldWithMap('Straße Mueller');
    expect(folded).toBe('strasse muller');
    // "ss" both come from "ß" (index 4).
    expect([starts[4], ends[5]]).toEqual([4, 5]);
    // "u" of "muller" covers "ue".
    expect([starts[9], ends[9]]).toEqual([8, 10]);
  });
});

describe('search tokens', () => {
  it('folds and splits the query', () => {
    expect(searchTokens('Mueller,  Köln einkauf köln')).toEqual(['muller', 'koln', 'einkauf']);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('a bc')).toBe(true);
    expect(isSearchable('  ')).toBe(false);
  });

  it('finds word prefixes in the original text', () => {
    const text = 'Jana Müller, Einkauf';
    const ranges = findTokenRanges(text, searchTokens('mueller einka'));
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(['Müller', 'Einka']);
    // Not in the middle of a word.
    expect(findTokenRanges('Baumüller', ['muller'])).toEqual([]);
    expect(matchedTokens('Baumüller Köln', ['muller', 'koln'])).toEqual(['koln']);
  });
});

describe('snippet', () => {
  it('keeps short texts and cuts long ones around the first hit', () => {
    expect(snippet('short', [[0, 5]])).toEqual({ text: 'short', highlights: [[0, 5]] });
    const long = `${'lorem ipsum '.repeat(20)}Angebot Köln ${'dolor sit '.repeat(20)}`;
    const ranges = findTokenRanges(long, ['koln']);
    const result = snippet(long, ranges, 80);
    expect(result.text.startsWith('…')).toBe(true);
    expect(result.text.endsWith('…')).toBe(true);
    const [[s, e]] = result.highlights as [[number, number]];
    expect(result.text.slice(s, e)).toBe('Köln');
  });
});
