import { afterEach, describe, expect, it, vi } from 'vitest';
import { localTimestamp, log, setLogLevel } from './log';

afterEach(() => {
  setLogLevel('info');
  vi.restoreAllMocks();
});

describe('log', () => {
  it('writes local time with offset', () => {
    const date = new Date('2026-10-12T10:00:00.000Z');
    const stamp = localTimestamp(date);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(stamp)).toBe(date.getTime());
  });

  it('filters by level', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.debug('hidden');
    log.info('shown');
    setLogLevel('error');
    log.warn('hidden too');
    log.error('broken');
    expect(out.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/INFO {2}shown$/),
    ]);
    expect(err.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/ERROR broken$/),
    ]);
  });
});
