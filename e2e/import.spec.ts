import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

const card = (lines: string[]) =>
  ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

test('import a vCard file: preview with a duplicate, complete it, undo the import', async ({
  page,
  request,
}) => {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const existing = await (
    await request.post('/api/v1/people', {
      data: { spaceId: spaces[0].id, firstName: 'Ida', lastName: 'Importtest' },
    })
  ).json();
  await request.post(`/api/v1/people/${existing.id}/contact-points`, {
    data: { kind: 'email', value: 'ida@example.com' },
  });

  await page.goto('/settings/import');
  await page.getByLabel('File').setInputFiles({
    name: 'iphone.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(
      [
        card(['N:Importtest;Ida;;;', 'EMAIL:ida@example.com', 'TEL;type=CELL:+49 170 5550099']),
        card(['N:Neuimport;Otto;;;', 'ORG:Importfirma GmbH', 'EMAIL:otto@example.com']),
      ].join('\r\n'),
    ),
  });
  await expect(page.getByText('2 contacts: 1 to add, 0 to complete, 1 to skip')).toBeVisible();
  await expect(
    page.getByText('Probably already here: Ida Importtest (same email, same name)'),
  ).toBeVisible();

  await page.getByLabel('What to do with Ida Importtest').selectOption('merge');
  await expect(page.getByText('2 contacts: 1 to add, 1 to complete, 0 to skip')).toBeVisible();
  await page.getByRole('button', { name: 'Import (2)' }).click();
  await expect(page.getByText('Import finished: 1 added, 1 completed, 0 skipped.')).toBeVisible();

  // The new person exists; the existing one got the phone number.
  await page.goto(`/people/${existing.id}`);
  await expect(
    page.getByRole('region', { name: 'Contact' }).getByRole('link', { name: '+49 170 5550099' }),
  ).toBeVisible();
  await page.goto('/people');
  await expect(page.getByRole('link', { name: /Otto Neuimport/ })).toBeVisible();

  // Undo from the history.
  await page.goto('/settings/import');
  const row = page.getByRole('listitem').filter({ hasText: 'iphone.vcf' });
  await expect(row).toContainText('1 added · 1 completed · 0 skipped');
  await row.getByRole('button', { name: 'Undo import' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo import' }).click();
  await expect(row).toContainText('Undone on');

  await page.goto('/people');
  await expect(page.getByRole('link', { name: /Otto Neuimport/ })).toHaveCount(0);
  await page.goto(`/people/${existing.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ida Importtest' })).toBeVisible();
  await expect(page.getByText('+49 170 5550099')).toHaveCount(0);
});

test('import a Google CSV: columns are recognized and can be changed', async ({ page }) => {
  await page.goto('/settings/import');
  await page.getByLabel('File').setInputFiles({
    name: 'contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'First Name,Last Name,E-mail 1 - Label,E-mail 1 - Value,Notes\nCarla,Csvtest,* Home,carla@example.com,Spielt Cello\n',
    ),
  });
  await expect(page.getByText('Recognized format: Google Contacts.')).toBeVisible();
  await expect(page.getByLabel('Column “E-mail 1 - Value” contains')).toHaveValue('email');
  await page.getByLabel('Column “Notes” contains').selectOption('');
  await expect(page.getByText('1 contact: 1 to add, 0 to complete, 0 to skip')).toBeVisible();
  await page.getByRole('button', { name: 'Import (1)' }).click();
  await expect(page.getByText('Import finished: 1 added, 0 completed, 0 skipped.')).toBeVisible();
  await page.getByRole('link', { name: 'Show people' }).click();
  await page.getByRole('link', { name: /Carla Csvtest/ }).click();
  await expect(page.getByRole('link', { name: 'carla@example.com' })).toBeVisible();
  await expect(page.getByText('Spielt Cello')).toHaveCount(0);
});
