import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', version: '1.2.3' })).toEqual({
      status: 'ok',
      version: '1.2.3',
    });
  });

  it('rejects an unknown status', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', version: '1.2.3' }).success).toBe(
      false,
    );
  });
});
