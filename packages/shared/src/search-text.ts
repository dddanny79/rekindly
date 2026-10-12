import { foldText, foldWithMap } from './text';

/** Queries need at least this many characters in one word. */
export const SEARCH_MIN_LENGTH = 2;

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Folded words of a search query (deduplicated, in order). */
export function searchTokens(query: string): string[] {
  const words = foldText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [...new Set(words)].slice(0, 12);
}

/** True if the query is long enough to search. */
export function isSearchable(query: string): boolean {
  return searchTokens(query).some((token) => token.length >= SEARCH_MIN_LENGTH);
}

/**
 * Ranges `[start, end)` in `text` where a word starts with one of the (folded)
 * tokens, umlaut- and accent-insensitive. Sorted, not overlapping.
 */
export function findTokenRanges(text: string, tokens: string[]): [number, number][] {
  if (!tokens.length || !text) return [];
  const { folded, starts, ends } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      from = at + 1;
      if (at > 0 && WORD_CHAR.test(folded[at - 1]!)) continue;
      ranges.push([starts[at]!, ends[at + token.length - 1]!]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Tokens that occur in `text` as word prefixes. */
export function matchedTokens(text: string, tokens: string[]): string[] {
  const folded = foldText(text);
  return tokens.filter((token) => {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) return false;
      if (at === 0 || !WORD_CHAR.test(folded[at - 1]!)) return true;
      from = at + 1;
    }
  });
}

/**
 * A window of about `length` characters around the first highlight, cut at word
 * boundaries, with “…” where text was left out. Highlights are moved along.
 */
export function snippet(
  text: string,
  highlights: [number, number][],
  length = 140,
): { text: string; highlights: [number, number][] } {
  if (text.length <= length) return { text, highlights };
  const first = highlights[0]?.[0] ?? 0;
  let start = Math.max(0, first - Math.floor(length / 3));
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space < first ? space + 1 : start;
  }
  let end = Math.min(text.length, start + length);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > first) end = space;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const shift = prefix.length - start;
  return {
    text: `${prefix}${text.slice(start, end)}${suffix}`,
    highlights: highlights
      .filter(([s, e]) => s >= start && e <= end)
      .map(([s, e]) => [s + shift, e + shift] as [number, number]),
  };
}
