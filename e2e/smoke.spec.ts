import { expect, test, type Page } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('app shell loads, navigates and switches language', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('complementary');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(sidebar.getByTestId('api-status')).toContainText('API reachable');

    await sidebar.getByRole('link', { name: 'People' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
    await expect(page).toHaveURL(/\/people$/);

    await sidebar.getByRole('button', { name: /switch to German/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Personen' })).toBeVisible();

    // Deep link served via SPA fallback; language choice persists.
    await page.goto('/organizations');
    await expect(page.getByRole('heading', { level: 1, name: 'Organisationen' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('loads bundled fonts without external requests', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith('http://127.0.0.1')) external.push(req.url());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded).toEqual(
      expect.arrayContaining(['Newsreader Variable', 'Source Sans 3 Variable']),
    );
    expect(external).toEqual([]);
  });
});

test.describe('appearance', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

  const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('follows the system, can be overridden and persists', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await background(page)).toBe('rgb(250, 249, 246)');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await background(page)).toBe('rgb(18, 19, 20)');
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses the tab bar and the More page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('complementary')).toBeHidden();

    const tabs = page.getByRole('navigation', { name: 'Main navigation' });
    await tabs.getByRole('link', { name: 'More' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();

    await page.getByRole('radio', { name: 'German' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mehr' })).toBeVisible();

    await page.getByRole('radio', { name: 'Dunkel' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('link', { name: 'Organisationen' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Organisationen' })).toBeVisible();
  });
});
