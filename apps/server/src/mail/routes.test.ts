import { afterEach, describe, expect, it } from 'vitest';
import type { MailSettings, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { smtpSink } from '../test/smtp';
import { digestDue, sendDigest } from './digest';
import { mailSettings } from './config';

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
  const configure = (input: object = {}) =>
    t.request('/api/v1/mail', {
      method: 'PUT',
      json: {
        host: '127.0.0.1',
        port: smtp.port,
        security: 'none',
        username: 'mailer',
        password: 'geheim',
        from: 'Rekindly <rekindly@example.com>',
        ...input,
      },
    });
  return { t, smtp, configure };
}

describe('mail', () => {
  it('settings keep the password secret; a test mail arrives', async () => {
    const { t, smtp, configure } = await setup();
    expect(await t.json<MailSettings>(t.request('/api/v1/mail'))).toMatchObject({
      source: 'none',
      to: 'erika@example.com',
    });
    expect((await t.request('/api/v1/mail/test', { method: 'POST' })).status).toBe(409);

    const saved = await t.json<MailSettings>(configure());
    expect(saved).toMatchObject({
      source: 'app',
      host: '127.0.0.1',
      hasPassword: true,
      security: 'none',
    });
    expect(JSON.stringify(saved)).not.toContain('geheim');
    expect((await t.request('/api/v1/mail/test', { method: 'POST' })).status).toBe(204);
    expect(smtp.mails).toHaveLength(1);
    expect(smtp.mails[0]).toContain('Subject: Rekindly: Testmail');
    expect(smtp.mails[0]).toContain('To: erika@example.com');
    expect(smtp.logins).toEqual([{ username: 'mailer', password: 'geheim' }]);
    const after = await t.json<MailSettings>(t.request('/api/v1/mail'));
    expect(after.status.lastSentAt).not.toBeNull();

    expect((await configure({ from: 'kein absender' })).status).toBe(400);
  });

  it('a failing server is reported with its reason', async () => {
    const { t, configure } = await setup();
    await configure({ port: 1 });
    const res = await t.request('/api/v1/mail/test', { method: 'POST' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'mail_failed' });
    expect((await t.json<MailSettings>(t.request('/api/v1/mail'))).status.lastError).toBeTruthy();
  });

  it('daily summary: due follow-ups and birthdays with links; nothing due, no mail', async () => {
    const { t, smtp, configure } = await setup();
    await configure();
    const nothing = await t.json<{ sent: boolean }>(
      t.request('/api/v1/mail/digest', { method: 'POST' }),
    );
    expect(nothing.sent).toBe(false);
    expect(smtp.mails).toHaveLength(0);

    const jana = await t.json<Person>(
      t.request('/api/v1/people', {
        method: 'POST',
        json: { spaceId: t.privateSpace, firstName: 'Jana', lastName: 'Berger' },
      }),
      201,
    );
    const today = new Date();
    const local = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await t.json(
      t.request(`/api/v1/people/${jana.id}/reminders`, {
        method: 'POST',
        json: { title: 'Angebot schicken', dueOn: local(today) },
      }),
      201,
    );
    const tomorrow = new Date(today.getTime() + 86_400_000);
    await t.json(
      t.request(`/api/v1/people/${jana.id}`, {
        method: 'PATCH',
        json: { birthday: `--${local(tomorrow).slice(5)}` },
      }),
    );

    const sent = await t.json<{ sent: boolean }>(
      t.request('/api/v1/mail/digest', { method: 'POST' }),
    );
    expect(sent.sent).toBe(true);
    const mail = smtp.mails[0]!.replace(/=\r?\n/g, '');
    expect(mail).toMatch(/Subject: Heute: 2 Sachen im Blick/);
    expect(mail).toContain('Angebot schicken');
    expect(mail).toContain('Jana Berger');
    expect(mail).toContain(`http://localhost:3000/people/${jana.id}`);
  });

  it('is due once a day from the set hour, and retries an hour after a failure', async () => {
    const { t, configure } = await setup();
    await configure({ digest: { enabled: true, hour: 7 } });
    const at = (h: number, day = 15) => new Date(2030, 0, day, h, 30);
    expect(digestDue(t.db, {}, at(6))).toBe(false);
    expect(digestDue(t.db, {}, at(8))).toBe(true);
    await sendDigest(
      { db: t.db, key: t.deps.secretKey(), env: {}, publicUrl: new URL('http://localhost:3000') },
      at(8),
    );
    expect(digestDue(t.db, {}, at(20))).toBe(false);
    expect(digestDue(t.db, {}, at(8, 16))).toBe(true);
  });

  it('SMTP settings from the environment win', async () => {
    const { t } = await setup();
    const settings = mailSettings(t.db, {
      host: 'smtp.example.com',
      port: 465,
      security: 'tls',
      username: 'u',
      password: 'p',
      from: 'a@example.com',
    });
    expect(settings).toMatchObject({
      source: 'env',
      host: 'smtp.example.com',
      port: 465,
      hasPassword: true,
    });
  });
});
