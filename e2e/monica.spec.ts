import { expect, test } from '@playwright/test';
import { monicaExport } from '../apps/server/src/contact-imports/monica-fixture';

test.use({ viewport: { width: 1280, height: 900 } });

// 1×1 PNG as Erika's avatar photo.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('import a Monica export: people with timeline, facts and relationships; undo', async ({
  page,
}) => {
  await page.goto('/settings/import');
  await page.getByLabel('File', { exact: true }).setInputFiles({
    name: 'monica.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(monicaExport(PNG))),
  });
  await expect(page.getByText('4 contacts: 4 to add, 0 to complete, 0 to skip')).toBeVisible();
  await expect(
    page.getByText('Also: 5 timeline entries, 2 follow-ups, 4 facts, 3 relationships.'),
  ).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Max Mustermann' })).toContainText(
    'indirect contact',
  );
  await page.getByRole('button', { name: 'Import (4)' }).click();
  await expect(page.getByText('Import finished: 4 added, 0 completed, 0 skipped.')).toBeVisible();

  await page.getByRole('link', { name: 'Show people' }).click();
  await page.getByRole('link', { name: /Erika \(Riki\) Musterfrau/ }).click();
  await expect(page.getByText('Über die Alpentour gesprochen').first()).toBeVisible();
  await expect(page.getByText('Abendessen beim Italiener').first()).toBeVisible();
  await expect(page.getByText('Trinkt lieber Tee als Kaffee.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Max Mustermann' }).first()).toBeVisible();

  await page.goto('/settings/import');
  const row = page.getByRole('listitem').filter({ hasText: 'monica.json' });
  await row.getByRole('button', { name: 'Undo import' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo import' }).click();
  await expect(row).toContainText('Undone on');
  await page.goto('/people');
  await expect(page.getByRole('link', { name: /Erika \(Riki\) Musterfrau/ })).toHaveCount(0);
});

test('Monica through its API: a wrong address is reported', async ({ page }) => {
  await page.goto('/settings/import');
  await page.getByRole('button', { name: 'Fetch from Monica instead …' }).click();
  const form = page.getByRole('form', { name: 'Fetch from Monica' });
  await form.getByLabel('Monica address').fill('http://127.0.0.1:1');
  await form.getByLabel('Access token').fill('token');
  await form.getByRole('button', { name: 'Fetch' }).click();
  await expect(form.getByText('Monica could not be reached at this address.')).toBeVisible();
});
