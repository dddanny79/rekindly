import { afterEach, describe, expect, it } from 'vitest';
import type { TwoFactorStatus } from '@app/shared';
import { createSignedInApp, OWNER } from '../test/helpers';
import { smtpSink } from '../test/smtp';
import { TwoFactorCodes } from './two-factor';

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function setup() {
  const t = await createSignedInApp();
  const smtp = await smtpSink();
  cleanups.push(
    () => t.cleanup(),
    () => smtp.close(),
  );
  await t.request('/api/v1/mail', {
    method: 'PUT',
    json: { host: '127.0.0.1', port: smtp.port, security: 'none', from: 'rekindly@example.com' },
  });
  return { t, smtp };
}

async function enable(
  t: Awaited<ReturnType<typeof setup>>['t'],
  smtp: Awaited<ReturnType<typeof setup>>['smtp'],
) {
  const start = await t.json<{ challengeId: string; sentTo: string }>(
    t.request('/api/v1/auth/two-factor/start', { method: 'POST' }),
  );
  expect(start.sentTo).toBe('e…a@example.com');
  const res = await t.request('/api/v1/auth/two-factor/enable', {
    method: 'POST',
    json: { challengeId: start.challengeId, code: smtp.lastCode() },
  });
  expect(res.status).toBe(204);
}

const login = (t: Awaited<ReturnType<typeof setup>>['t'], headers: Record<string, string> = {}) =>
  t.request('/api/v1/auth/login', {
    method: 'POST',
    json: { email: OWNER.email, password: OWNER.password },
    headers,
  });

describe('sign-in codes by email', () => {
  it('switching on needs a code that arrived', async () => {
    const { t, smtp } = await setup();
    const start = await t.json<{ challengeId: string }>(
      t.request('/api/v1/auth/two-factor/start', { method: 'POST' }),
    );
    expect(smtp.mails.at(-1)).toContain('Subject: Dein Rekindly-Anmeldecode');
    const wrong = await t.request('/api/v1/auth/two-factor/enable', {
      method: 'POST',
      json: {
        challengeId: start.challengeId,
        code: '000000' === smtp.lastCode() ? '111111' : '000000',
      },
    });
    expect(wrong.status).toBe(400);
    await enable(t, smtp);
    expect((await t.json<TwoFactorStatus>(t.request('/api/v1/auth/two-factor'))).enabled).toBe(
      true,
    );
  });

  it('password sign-in then asks for the code; a trusted device skips it', async () => {
    const { t, smtp } = await setup();
    await enable(t, smtp);
    t.clearCookies();

    const first = await t.json<{ twoFactor: { challengeId: string } }>(login(t));
    expect(first.twoFactor.challengeId).toBeTruthy();
    expect(t.getCookie()).toBeNull();
    const code = smtp.lastCode()!;
    const wrong = await t.request('/api/v1/auth/login/verify', {
      method: 'POST',
      json: {
        challengeId: first.twoFactor.challengeId,
        code: code === '000000' ? '111111' : '000000',
      },
    });
    expect(wrong.status).toBe(401);
    const ok = await t.request('/api/v1/auth/login/verify', {
      method: 'POST',
      json: { challengeId: first.twoFactor.challengeId, code, trustDevice: true },
    });
    expect(ok.status).toBe(200);
    const trusted = ok.headers.getSetCookie().find((c) => c.startsWith('trusted_device='))!;
    expect(trusted).toContain('Path=/api/v1/auth');
    // The same code cannot be used twice.
    expect(
      (
        await t.request('/api/v1/auth/login/verify', {
          method: 'POST',
          json: { challengeId: first.twoFactor.challengeId, code },
        })
      ).status,
    ).toBe(401);

    t.clearCookies();
    const again = await t.json<{ account?: unknown }>(login(t, { cookie: trusted.split(';')[0]! }));
    expect(again.account).toBeTruthy();

    const status = await t.json<TwoFactorStatus>(t.request('/api/v1/auth/two-factor'));
    expect(status.trustedDevices).toHaveLength(1);
    // A password change forgets every trusted device.
    await t.request('/api/v1/account/password', {
      method: 'PUT',
      json: { currentPassword: OWNER.password, newPassword: 'another long password 123' },
    });
    expect(
      (await t.json<TwoFactorStatus>(t.request('/api/v1/auth/two-factor'))).trustedDevices,
    ).toEqual([]);
  });

  it('switching off needs the password', async () => {
    const { t, smtp } = await setup();
    await enable(t, smtp);
    expect(
      (
        await t.request('/api/v1/auth/two-factor/disable', {
          method: 'POST',
          json: { password: 'falsch' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.request('/api/v1/auth/two-factor/disable', {
          method: 'POST',
          json: { password: OWNER.password },
        })
      ).status,
    ).toBe(204);
    t.clearCookies();
    expect(await t.json<{ account?: unknown }>(login(t))).toHaveProperty('account');
  });

  it('codes expire after 10 minutes and allow 5 attempts', () => {
    const codes = new TwoFactorCodes();
    const a = codes.create('login', 0);
    expect(codes.verify(a.id, a.code, 'login', 11 * 60 * 1000)).toBe(false);
    const b = codes.create('login', 0);
    for (let i = 0; i < 5; i++)
      expect(codes.verify(b.id, b.code === '000000' ? '111111' : '000000', 'login', 1)).toBe(false);
    expect(codes.verify(b.id, b.code, 'login', 1)).toBe(false);
    const c = codes.create('enable', 0);
    expect(codes.verify(c.id, c.code, 'login', 1)).toBe(false);
  });
});
