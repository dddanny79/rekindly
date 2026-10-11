import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@app/shared';
import { createApp } from '../app';
import { APP_VERSION } from '../version';

describe('GET /api/health', () => {
  it('returns status ok and the version', async () => {
    const res = await createApp().request('/api/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toEqual({ status: 'ok', version: APP_VERSION });
  });
});
