import { expect, type Page, test } from '@playwright/test';
import { OWNER } from './fixtures';

// These tests sign in and out themselves; they must not reuse the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

async function signInWithPassword(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
}

test('API routes need a session, except health and auth', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  expect((await request.get('/api/v1/auth/status')).status()).toBe(200);
  for (const path of ['/api/v1/account', '/api/v1/auth/passkeys', '/api/v1/anything']) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
});

test('password login, wrong password, logout and redirect back', async ({ page }) => {
  await page.goto('/organizations');
  await expect(page).toHaveURL(/\/login\?redirect=%2Forganizations$/);

  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill('not the password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is wrong.');

  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Organizations' })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('switch passkeys on, add one, sign in with it, rename and delete it', async ({ page }) => {
  // Chromium's virtual authenticator stands in for Touch ID / a security key.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  // Off by default: no passkey option on the sign-in page.
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toHaveCount(0);

  await signInWithPassword(page);
  await page.goto('/settings');
  await expect(page.getByText(/Passkeys are switched off/)).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Passkeys' })
    .getByRole('radio', { name: 'On' })
    .click();
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add passkey' }).click();
  const list = page.getByRole('list', { name: 'Passkeys' });
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  await page.goto('/settings');
  await expect(list).toContainText('last used');
  await list.getByRole('button', { name: 'Rename' }).click();
  await list.getByLabel('Name').fill('Werkbank');
  await list.getByRole('button', { name: 'Save' }).click();
  await expect(list).toContainText('Werkbank');

  await list.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete the passkey “Werkbank”?');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No passkeys yet.')).toBeVisible();

  // Switch off again: the sign-in page no longer offers passkeys.
  await page
    .getByRole('radiogroup', { name: 'Passkeys' })
    .getByRole('radio', { name: 'Off' })
    .click();
  await expect(page.getByText(/Passkeys are switched off/)).toBeVisible();
});
