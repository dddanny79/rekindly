import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.afterAll(async ({ request }) => {
  // Leave the instance defaults as the other tests expect them.
  await request.put('/api/v1/themes/defaults', {
    data: { defaultThemeId: 'rekindly', defaultLayoutId: 'classic' },
  });
});

test('themes and layouts: choose, build your own, export and import', async ({ page, request }) => {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const person = await (
    await request.post('/api/v1/people', {
      data: { spaceId: spaces[0].id, firstName: 'Thea', lastName: 'Tapete' },
    })
  ).json();
  await request.post(`/api/v1/people/${person.id}/facts`, { data: { text: 'Mag Mohnkuchen' } });

  // A built-in theme applies at once and survives a reload.
  await page.goto('/settings/appearance');
  await page.getByRole('radio', { name: /^Ledger/ }).check({ force: true });
  await expect.poll(() => cssVar(page, '--font-ui')).toContain('IBM Plex Sans');
  await page.reload();
  await expect.poll(() => cssVar(page, '--font-ui')).toContain('IBM Plex Sans');

  // A layout template changes the person page.
  await page.getByRole('radio', { name: /^Focus/ }).check({ force: true });
  await page.goto(`/people/${person.id}`);
  await expect(page.locator('[data-section="timeline"]')).toBeVisible();
  await expect(page.locator('[data-section="facts"]')).toHaveCount(0);

  // An own theme: colours, layout, saved.
  await page.goto('/settings/appearance');
  await page.getByRole('button', { name: 'New theme' }).click();
  await expect(page.getByRole('heading', { name: 'Edit theme' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Tapete');
  await page.getByRole('textbox', { name: 'Hex value for Signal (due, active)' }).fill('#0b5394');
  await expect.poll(() => cssVar(page, '--signal')).toBe('#0b5394');
  await page.getByLabel('This theme has its own layout').check();
  await page.getByRole('radio', { name: 'One column' }).click();
  await page
    .getByRole('list', { name: 'Sections' })
    .getByRole('listitem')
    .filter({ hasText: 'Tags' })
    .getByLabel('Show')
    .uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole('radio', { name: /^Tapete/ })).toBeChecked();
  await page.getByRole('radio', { name: /^From the theme/ }).check({ force: true });

  await page.goto(`/people/${person.id}`);
  await expect(page.locator('[data-section="facts"]')).toBeVisible();
  await expect(page.locator('[data-section="tags"]')).toHaveCount(0);
  await expect(page.locator('article aside')).toHaveCount(0);
  expect(await cssVar(page, '--signal')).toBe('#0b5394');

  // Export, delete, import again (as on another instance).
  await page.goto('/settings/appearance');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Tapete' }).click();
  const file = await (await download).path();
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(exported).toMatchObject({ format: 'rekindly-theme', version: 1, name: 'Tapete' });
  expect(exported.personPage.columns).toBe(1);

  await page.getByRole('button', { name: 'Delete Tapete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('status')).toContainText('“Tapete” deleted.');
  await expect(page.getByRole('radio', { name: /^Tapete/ })).toHaveCount(0);

  await page.getByTestId('theme-import').setInputFiles(file);
  await expect(page.getByText('“Tapete” imported and selected on this device.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Tapete/ })).toBeChecked();

  // A broken file is refused with a reason.
  await page.getByTestId('theme-import').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, version: 9 })),
  });
  await expect(page.getByText(/This file is not a valid theme\. version/)).toBeVisible();

  // The choice of this device becomes the default of the instance.
  await page.getByRole('button', { name: 'Use the choice of this device' }).click();
  await expect(
    page.getByText(/^Default: Tapete with the layout “From the theme”\.$/),
  ).toBeVisible();
});
