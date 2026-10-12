import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateApiTokenResponse, Space } from '@app/shared';
import { apiTokens } from '../db/schema';
import { createSignedInApp } from '../test/helpers';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

const createToken = (t: App, scope: 'read' | 'write', expiresInDays: number | null = null) =>
  t.json<CreateApiTokenResponse>(
    t.request('/api/v1/api-tokens', {
      method: 'POST',
      json: { name: 'Skript', scope, expiresInDays },
    }),
    201,
  );

/** A request without the session cookie, with the token. */
async function withToken(
  t: App,
  token: string,
  path: string,
  init: RequestInit & { json?: unknown } = {},
) {
  const cookie = t.getCookie();
  t.clearCookies();
  try {
    return await t.request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        authorization: `Bearer ${token}`,
        origin: '',
      },
    });
  } finally {
    t.setCookie(cookie);
  }
}

describe('API tokens', () => {
  it('a read token reads the data, but cannot write or reach account and credentials', async () => {
    const t = await app();
    const { token, apiToken, mcpUrl } = await createToken(t, 'read', 30);
    expect(token).toMatch(/^rkt_[\w-]{40,}$/);
    expect(apiToken).toMatchObject({ name: 'Skript', scope: 'read', lastUsedAt: null });
    expect(apiToken.expiresAt).not.toBeNull();
    expect(mcpUrl).toBe('http://localhost:3000/mcp');

    expect((await withToken(t, token, '/api/v1/people')).status).toBe(200);
    const write = await withToken(t, token, '/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.privateSpace, firstName: 'Nein' },
    });
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: 'token_read_only' });
    for (const path of [
      '/api/v1/account',
      '/api/v1/api-tokens',
      '/api/v1/app-passwords',
      '/api/v1/backup',
      '/api/v1/export/json',
    ]) {
      const res = await withToken(t, token, path);
      expect(res.status, path).toBe(403);
    }
    const list = await t.json<{ apiTokens: { lastUsedAt: string | null }[] }>(
      t.request('/api/v1/api-tokens'),
    );
    expect(list.apiTokens[0]!.lastUsedAt).not.toBeNull();
  });

  it('a write token can write', async () => {
    const t = await app();
    const { token } = await createToken(t, 'write');
    const res = await withToken(t, token, '/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.privateSpace, firstName: 'Per', lastName: 'Token' },
    });
    expect(res.status).toBe(201);
  });

  it('expired, revoked and unknown tokens are refused', async () => {
    const t = await app();
    const expired = await createToken(t, 'read', 1);
    t.db
      .update(apiTokens)
      .set({ expiresAt: '2000-01-01T00:00:00.000Z' })
      .where(eq(apiTokens.id, expired.apiToken.id))
      .run();
    expect((await withToken(t, expired.token, '/api/v1/people')).status).toBe(401);

    const revoked = await createToken(t, 'write');
    expect(
      (await t.request(`/api/v1/api-tokens/${revoked.apiToken.id}`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await withToken(t, revoked.token, '/api/v1/people')).status).toBe(401);
    expect((await withToken(t, 'rkt_falsch', '/api/v1/people')).status).toBe(401);
    expect(
      (await t.request(`/api/v1/api-tokens/${revoked.apiToken.id}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('tokens from before the rename (pgt_) still work', async () => {
    const t = await app();
    const legacy = 'pgt_' + 'x'.repeat(43);
    const { createHash } = await import('node:crypto');
    t.db
      .insert(apiTokens)
      .values({
        id: 'legacy',
        name: 'Alt',
        scope: 'read',
        tokenHash: createHash('sha256').update(legacy).digest('hex'),
      })
      .run();
    expect((await withToken(t, legacy, '/api/v1/people')).status).toBe(200);
  });

  it('spaces carry the AI permission, off by default', async () => {
    const t = await app();
    const { spaces } = await t.json<{ spaces: Space[] }>(t.request('/api/v1/spaces'));
    expect(spaces.every((s) => s.aiAllowed === false)).toBe(true);
    const updated = await t.json<Space>(
      t.request(`/api/v1/spaces/${t.privateSpace}`, { method: 'PATCH', json: { aiAllowed: true } }),
    );
    expect(updated.aiAllowed).toBe(true);
  });
});
