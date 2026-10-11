import { expect, test } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test('app shell loads, navigates and switches language', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toContainText('API reachable');

  await page.getByRole('link', { name: 'People' }).click();
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(page).toHaveURL(/\/people$/);

  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: 'German' }).click();
  await expect(page.getByRole('heading', { name: 'Personen' })).toBeVisible();

  // Deep link served via SPA fallback; language choice persists.
  await page.goto('/organizations');
  await expect(page.getByRole('heading', { name: 'Organisationen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
