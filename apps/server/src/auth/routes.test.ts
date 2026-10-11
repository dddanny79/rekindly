import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authStatusResponseSchema, passkeyListResponseSchema } from '@app/shared';
import { passkeys, sessions } from '../db/schema';
import { createTestApp, OWNER, setupOwner, type TestApp } from '../test/helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.cleanup());

const status = async () =>
  authStatusResponseSchema.parse(await (await t.request('/api/v1/auth/status')).json());

describe('setup', () => {
  it('reports setup as required on a fresh instance', async () => {
    expect(await status()).toEqual({
      setupRequired: true,
      authenticated: false,
      account: null,
      passkeysEnabled: false,
    });
  });

  it('creates the account, signs in and locks setup', async () => {
    const res = await setupOwner(t);
    expect(res.headers.get('set-cookie')).toMatch(
      /session=.+; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax/,
    );
    expect(res.headers.get('set-cookie')).not.toMatch(/Secure/);
    expect(await status()).toEqual({
      setupRequired: false,
      authenticated: true,
      account: { name: OWNER.name, email: OWNER.email, locale: 'de' },
      passkeysEnabled: false,
    });

    t.clearCookies();
    const again = await t.request('/api/v1/auth/setup', { method: 'POST', json: OWNER });
    expect(again.status).toBe(403);
    expect(await again.json()).toEqual({ error: 'setup_completed' });
  });

  it('rejects short passwords and invalid emails', async () => {
    const res = await t.request('/api/v1/auth/setup', {
      method: 'POST',
      json: { ...OWNER, email: 'nope', password: 'short' },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.map((i) => i.path).sort()).toEqual(['email', 'password']);
  });

  it('never stores the password in clear text', async () => {
    await setupOwner(t);
    const row = t.db.query.account.findFirst().sync();
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe('login and logout', () => {
  beforeEach(async () => {
    await setupOwner(t);
    await t.request('/api/v1/auth/logout', { method: 'POST' });
  });

  it('signs in with email (case-insensitive) and password', async () => {
    expect((await status()).authenticated).toBe(false);
    const res = await t.request('/api/v1/auth/login', {
      method: 'POST',
      json: { email: 'Erika@Example.com', password: OWNER.password },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      account: { name: OWNER.name, email: OWNER.email, locale: 'de' },
    });
    expect((await status()).authenticated).toBe(true);
  });

  it('rejects a wrong password or email with the same error', async () => {
    for (const json of [
      { email: OWNER.email, password: 'wrong password!!' },
      { email: 'other@example.com', password: OWNER.password },
    ]) {
      const res = await t.request('/api/v1/auth/login', { method: 'POST', json });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    }
  });

  it('rate-limits repeated attempts', async () => {
    const attempt = () =>
      t.request('/api/v1/auth/login', {
        method: 'POST',
        json: { email: OWNER.email, password: 'wrong password!!' },
      });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('logout deletes the session server-side', async () => {
    await t.request('/api/v1/auth/login', {
      method: 'POST',
      json: { email: OWNER.email, password: OWNER.password },
    });
    const cookie = t.getCookie();
    expect(t.db.select().from(sessions).all()).toHaveLength(1);

    await t.request('/api/v1/auth/logout', { method: 'POST' });
    expect(t.db.select().from(sessions).all()).toHaveLength(0);

    // The old cookie no longer works.
    t.setCookie(cookie);
    expect((await t.request('/api/v1/account')).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    await t.request('/api/v1/auth/login', {
      method: 'POST',
      json: { email: OWNER.email, password: OWNER.password },
    });
    t.db.update(sessions).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
    expect((await t.request('/api/v1/account')).status).toBe(401);
  });
});

describe('protection', () => {
  it('answers 401 for every v1 route without a session, including unknown ones', async () => {
    await setupOwner(t);
    t.clearCookies();
    for (const [method, path] of [
      ['GET', '/api/v1/account'],
      ['PUT', '/api/v1/account/password'],
      ['GET', '/api/v1/auth/passkeys'],
      ['POST', '/api/v1/auth/passkeys/register/options'],
      ['PATCH', '/api/v1/auth/passkeys/x'],
      ['DELETE', '/api/v1/auth/passkeys/x'],
      ['GET', '/api/v1/settings'],
      ['PATCH', '/api/v1/settings'],
      ['GET', '/api/v1/people'],
    ] as const) {
      const res = await t.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('keeps health and auth bootstrap public', async () => {
    expect((await t.request('/api/health')).status).toBe(200);
    expect((await t.request('/api/v1/auth/status')).status).toBe(200);
  });

  it('accepts the public origin behind a TLS proxy (request URL is http)', async () => {
    await setupOwner(t);
    const res = await t.request('http://localhost/api/v1/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
  });

  it('rejects cross-site form posts', async () => {
    const res = await t.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'email=x&password=y',
    });
    expect(res.status).toBe(403);
  });
});

describe('account', () => {
  beforeEach(() => setupOwner(t));

  it('returns the account', async () => {
    const res = await t.request('/api/v1/account');
    expect(await res.json()).toEqual({ name: OWNER.name, email: OWNER.email, locale: 'de' });
  });

  it('changes the password and signs out other sessions', async () => {
    const mine = t.getCookie();
    // A second session (another device).
    t.clearCookies();
    await t.request('/api/v1/auth/login', {
      method: 'POST',
      json: { email: OWNER.email, password: OWNER.password },
    });
    const other = t.getCookie();
    t.setCookie(mine);

    const wrong = await t.request('/api/v1/account/password', {
      method: 'PUT',
      json: { currentPassword: 'not the password', newPassword: 'a brand new password' },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'invalid_current_password' });

    const res = await t.request('/api/v1/account/password', {
      method: 'PUT',
      json: { currentPassword: OWNER.password, newPassword: 'a brand new password' },
    });
    expect(res.status).toBe(204);
    expect((await t.request('/api/v1/account')).status).toBe(200);

    t.setCookie(other);
    expect((await t.request('/api/v1/account')).status).toBe(401);

    t.clearCookies();
    const login = await t.request('/api/v1/auth/login', {
      method: 'POST',
      json: { email: OWNER.email, password: 'a brand new password' },
    });
    expect(login.status).toBe(200);
  });
});

const enablePasskeys = (enabled = true) =>
  t.request('/api/v1/settings', { method: 'PATCH', json: { passkeysEnabled: enabled } });

describe('passkey switch', () => {
  beforeEach(() => setupOwner(t));

  it('is off by default and blocks passkey sign-in and registration', async () => {
    expect(await (await t.request('/api/v1/settings')).json()).toEqual({ passkeysEnabled: false });
    for (const path of [
      '/api/v1/auth/passkeys/register/options',
      '/api/v1/auth/passkeys/login/options',
    ]) {
      const res = await t.request(path, { method: 'POST' });
      expect(res.status, path).toBe(403);
      expect(await res.json()).toEqual({ error: 'passkeys_disabled' });
    }
    const verify = await t.request('/api/v1/auth/passkeys/login/verify', {
      method: 'POST',
      json: { response: { id: 'abc', rawId: 'abc', type: 'public-key', response: {} } },
    });
    expect(verify.status).toBe(403);
  });

  it('can be switched on and off and is reported in the public status', async () => {
    const on = await enablePasskeys();
    expect(await on.json()).toEqual({ passkeysEnabled: true });
    t.clearCookies();
    expect((await status()).passkeysEnabled).toBe(true);
    expect(
      (await t.request('/api/v1/auth/passkeys/login/options', { method: 'POST' })).status,
    ).toBe(200);
  });

  it('rejects invalid values', async () => {
    const res = await t.request('/api/v1/settings', {
      method: 'PATCH',
      json: { passkeysEnabled: 'yes' },
    });
    expect(res.status).toBe(400);
  });
});

describe('passkeys', () => {
  beforeEach(async () => {
    await setupOwner(t);
    await enablePasskeys();
  });

  it('issues registration options for the account and the configured RP', async () => {
    const res = await t.request('/api/v1/auth/passkeys/register/options', { method: 'POST' });
    expect(res.status).toBe(200);
    const options = (await res.json()) as {
      rp: { id: string; name: string };
      user: { name: string; displayName: string };
      challenge: string;
      authenticatorSelection: { residentKey: string };
    };
    expect(options.rp.id).toBe('localhost');
    expect(options.user).toMatchObject({ name: OWNER.email, displayName: OWNER.name });
    expect(options.authenticatorSelection.residentKey).toBe('required');
    expect(options.challenge.length).toBeGreaterThan(20);
  });

  it('issues login options without a session', async () => {
    t.clearCookies();
    const res = await t.request('/api/v1/auth/passkeys/login/options', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rpId: 'localhost' });
  });

  it('rejects an unknown or forged assertion', async () => {
    t.clearCookies();
    const res = await t.request('/api/v1/auth/passkeys/login/verify', {
      method: 'POST',
      json: { response: { id: 'abc', rawId: 'abc', type: 'public-key', response: {} } },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_passkey' });
  });

  it('rejects a forged registration', async () => {
    const res = await t.request('/api/v1/auth/passkeys/register/verify', {
      method: 'POST',
      json: {
        name: 'Laptop',
        response: { id: 'abc', rawId: 'abc', type: 'public-key', response: {} },
      },
    });
    expect(res.status).toBe(400);
  });

  it('lists, renames and deletes passkeys', async () => {
    t.db
      .insert(passkeys)
      .values({
        id: 'cred-1',
        name: 'Laptop',
        publicKey: Buffer.from([1, 2, 3]),
        deviceType: 'multiDevice',
        backedUp: true,
      })
      .run();

    const list = passkeyListResponseSchema.parse(
      await (await t.request('/api/v1/auth/passkeys')).json(),
    );
    expect(list.passkeys).toEqual([
      expect.objectContaining({ id: 'cred-1', name: 'Laptop', backedUp: true, lastUsedAt: null }),
    ]);

    const renamed = await t.request('/api/v1/auth/passkeys/cred-1', {
      method: 'PATCH',
      json: { name: 'iPhone' },
    });
    expect(await renamed.json()).toMatchObject({ id: 'cred-1', name: 'iPhone' });

    expect((await t.request('/api/v1/auth/passkeys/cred-1', { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await t.request('/api/v1/auth/passkeys/cred-1', { method: 'DELETE' })).status).toBe(
      404,
    );
    expect(
      (await t.request('/api/v1/auth/passkeys/nope', { method: 'PATCH', json: { name: 'x' } }))
        .status,
    ).toBe(404);
  });
});
