import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateApiTokenResponse, ThemeListResponse, ThemeRecord } from '@app/shared';
import { themes } from '../db/schema';
import { createSignedInApp } from '../test/helpers';
import { purgeExpired } from '../trash/service';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

const mine = {
  format: 'rekindly-theme',
  version: 1,
  name: 'Mine',
  colors: { light: { signal: '#0055aa' }, dark: { signal: '#88bbff' } },
  fonts: { content: 'literata', ui: 'inter' },
  radius: 'medium',
  density: 'compact',
  personPage: { columns: 1, sections: [{ id: 'timeline' }, { id: 'briefing' }] },
};

const create = (t: App, theme: unknown = mine) =>
  t.json<ThemeRecord>(t.request('/api/v1/themes', { method: 'POST', json: { theme } }), 201);
const list = (t: App) => t.json<ThemeListResponse>(t.request('/api/v1/themes'));

describe('themes', () => {
  it('lists the built-in themes, the layout templates and the defaults', async () => {
    const t = await app();
    const body = await list(t);
    expect(body.themes.map((th) => th.id)).toEqual([
      'rekindly',
      'ledger',
      'hearth',
      'clear',
      'studio',
      'forest',
    ]);
    expect(body.themes.every((th) => th.builtIn)).toBe(true);
    expect(body.layouts.map((l) => l.id)).toEqual([
      'classic',
      'conversation',
      'profile',
      'address-book',
      'focus',
    ]);
    expect(body).toMatchObject({ defaultThemeId: 'rekindly', defaultLayoutId: 'classic' });
  });

  it('creates, reads, updates and lists a theme of its own', async () => {
    const t = await app();
    const created = await create(t);
    expect(created).toMatchObject({ builtIn: false, theme: { name: 'Mine', radius: 'medium' } });
    expect(await t.json<ThemeRecord>(t.request(`/api/v1/themes/${created.id}`))).toEqual(created);

    const updated = await t.json<ThemeRecord>(
      t.request(`/api/v1/themes/${created.id}`, {
        method: 'PUT',
        json: { theme: { ...mine, name: 'Mine, again' } },
      }),
    );
    expect(updated.theme.name).toBe('Mine, again');
    expect((await list(t)).themes.at(-1)).toMatchObject({
      id: created.id,
      theme: { name: 'Mine, again' },
    });
  });

  it('rejects invalid themes and custom CSS that would load something', async () => {
    const t = await app();
    const post = (theme: unknown) =>
      t.request('/api/v1/themes', { method: 'POST', json: { theme } });
    expect((await post({ ...mine, version: 2 })).status).toBe(400);
    expect((await post({ ...mine, colors: { light: { background: 'blue' } } })).status).toBe(400);
    expect(
      (await post({ ...mine, css: 'body{background:url(https://example.com/x.png)}' })).status,
    ).toBe(400);
    expect((await post({ ...mine, css: '.kicker{letter-spacing:.2em}' })).status).toBe(201);
  });

  it('keeps the built-in themes fixed', async () => {
    const t = await app();
    const res = await t.request('/api/v1/themes/ledger', { method: 'PUT', json: { theme: mine } });
    expect(res.status).toBe(409);
    expect((await t.request('/api/v1/themes/ledger', { method: 'DELETE' })).status).toBe(409);
    expect((await t.request('/api/v1/themes/ledger')).status).toBe(200);
    expect((await t.request('/api/v1/themes/nope')).status).toBe(404);
  });

  it('sets the instance defaults and falls back when the default theme is deleted', async () => {
    const t = await app();
    const created = await create(t);
    const put = (json: unknown) => t.request('/api/v1/themes/defaults', { method: 'PUT', json });
    expect((await put({ defaultThemeId: 'nope' })).status).toBe(422);
    expect((await put({ defaultLayoutId: 'nope' })).status).toBe(422);
    expect(
      await (await put({ defaultThemeId: created.id, defaultLayoutId: 'theme' })).json(),
    ).toEqual({
      defaultThemeId: created.id,
      defaultLayoutId: 'theme',
    });
    expect(await list(t)).toMatchObject({ defaultThemeId: created.id, defaultLayoutId: 'theme' });

    expect((await t.request(`/api/v1/themes/${created.id}`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect(await list(t)).toMatchObject({ defaultThemeId: 'rekindly', defaultLayoutId: 'theme' });
  });

  it('moves a deleted theme to the trash, restores it and purges it after 30 days', async () => {
    const t = await app();
    const created = await create(t);
    await t.request(`/api/v1/themes/${created.id}`, { method: 'DELETE' });
    expect((await list(t)).themes.some((th) => th.id === created.id)).toBe(false);
    expect((await t.request(`/api/v1/themes/${created.id}`)).status).toBe(404);

    const restored = await t.json<ThemeRecord>(
      t.request(`/api/v1/themes/${created.id}/restore`, { method: 'POST' }),
    );
    expect(restored.theme.name).toBe('Mine');

    await t.request(`/api/v1/themes/${created.id}`, { method: 'DELETE' });
    const later = new Date(Date.now() + 31 * 86_400_000);
    await purgeExpired(t.db, t.dataDir, later);
    expect(t.db.select().from(themes).where(eq(themes.id, created.id)).get()).toBeUndefined();
  });

  it('needs a session; API tokens have no access', async () => {
    const t = await app();
    const { token } = await t.json<CreateApiTokenResponse>(
      t.request('/api/v1/api-tokens', {
        method: 'POST',
        json: { name: 'Skript', scope: 'write', expiresInDays: null },
      }),
      201,
    );
    t.clearCookies();
    expect((await t.request('/api/v1/themes')).status).toBe(401);
    const res = await t.request('/api/v1/themes', {
      headers: { authorization: `Bearer ${token}`, origin: '' },
    });
    expect(res.status).toBe(403);
  });
});
