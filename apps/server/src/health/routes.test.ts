import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@app/shared';
import { createTestApp, type TestApp } from '../test/helpers';
import { APP_VERSION } from '../version';

describe('GET /api/health', () => {
  let t: TestApp;
  beforeAll(() => {
    t = createTestApp();
  });
  afterAll(() => t.cleanup());

  it('returns status ok and the version without a session', async () => {
    const res = await t.request('/api/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toEqual({ status: 'ok', version: APP_VERSION });
  });
});
