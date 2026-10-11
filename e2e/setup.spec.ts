import { expect, test } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { OWNER } from './fixtures';

test('fresh start: setup wizard creates the account and signs in', async ({ page, request }) => {
  // Every page leads to the setup while no account exists.
  await page.goto('/people');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Set up' })).toBeVisible();

  // Client-side validation.
  await page.getByLabel('Your name').fill(OWNER.name);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill('too short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('At least 12 characters.').last()).toBeVisible();

  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Signed in to the empty app.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(
    page.getByRole('complementary').getByRole('link', { name: OWNER.name }),
  ).toBeVisible();

  // Setup is locked for good.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/$/);
  const again = await request.post('/api/v1/auth/setup', {
    data: { ...OWNER, locale: 'en' },
  });
  expect(again.status()).toBe(403);

  await page.context().storageState({ path: STORAGE_STATE });
});
