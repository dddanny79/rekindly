import { expect, test } from '@playwright/test';
import { smtpSink } from '../apps/server/src/test/smtp';
import { OWNER } from './fixtures';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 10_000 });

test('mail: SMTP settings, test mail, sign-in code by email with a trusted browser', async ({
  page,
  request,
}) => {
  const smtp = await smtpSink();
  try {
    await page.goto('/settings/mail');
    const form = page.getByRole('form', { name: 'Mail server' });
    await form.getByLabel('SMTP server').fill('127.0.0.1');
    await form.getByLabel('Port').fill(String(smtp.port));
    await form.getByLabel('Encryption').selectOption('none');
    await form.getByLabel('Sender').fill('Rekindly <rekindly@example.com>');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByText('Saved.')).toBeVisible();
    await form.getByRole('button', { name: 'Send test mail' }).click();
    await expect(page.getByText(`Test mail sent to ${OWNER.email}.`)).toBeVisible();
    expect(smtp.mails.at(-1)).toContain('Subject: Rekindly: Test mail');

    // Switch on sign-in codes: needs a code that really arrived.
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'Sign-in code by email' });
    await section.getByRole('button', { name: 'Switch on' }).click();
    await expect(section.getByText(/We sent a code to/)).toBeVisible();
    await section.getByLabel('Code from the mail').fill(smtp.lastCode()!);
    await section.getByRole('button', { name: 'Confirm and switch on' }).click();
    await expect(section.getByText(/^On:/)).toBeVisible();

    // A fresh browser signs in with password + code and trusts itself.
    const browser = page.context().browser()!;
    // Without the stored session of the test project.
    const fresh = await browser.newContext({
      baseURL: page.url(),
      locale: 'en-US',
      storageState: { cookies: [], origins: [] },
    });
    const p = await fresh.newPage();
    await p.goto('/login');
    await p.getByLabel('Email').fill(OWNER.email);
    await p.getByLabel('Password').fill(OWNER.password);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Sign-in code' })).toBeVisible();
    await p.getByLabel('Code from the mail').fill(smtp.lastCode()!);
    await p.getByLabel('Trust this browser for 30 days').check();
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // Signed out, the trusted browser needs no code.
    await p.context().clearCookies({ name: 'session' });
    await p.goto('/login');
    await p.getByLabel('Email').fill(OWNER.email);
    await p.getByLabel('Password').fill(OWNER.password);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await fresh.close();
  } finally {
    // Off again for the other tests.
    await request.post('/api/v1/auth/two-factor/disable', { data: { password: OWNER.password } });
    await smtp.close();
  }
});
