import { expect, type APIRequestContext, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

async function createPerson(
  request: APIRequestContext,
  firstName: string,
  lastName: string,
  extra: Record<string, unknown> = {},
) {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const person = await (
    await request.post('/api/v1/people', { data: { spaceId: spaces[0].id, firstName, lastName } })
  ).json();
  if (Object.keys(extra).length)
    await request.patch(`/api/v1/people/${person.id}`, { data: extra });
  return person as { id: string };
}

/** Names in the people table, filtered by name. */
async function tableNames(page: Page, filter: string) {
  await page.goto('/people');
  await page.getByLabel('Filter by name').fill(filter);
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).not.toHaveCount(1);
  return rows.locator('td:first-child .font-semibold').allInnerTexts();
}

test.afterEach(async ({ request }) => {
  // Instance-wide: back to the defaults for the other tests.
  await request.patch('/api/v1/settings', {
    data: { nameDisplayOrder: 'firstLast', nameSortOrder: 'lastName' },
  });
});

test('names: last name first and sorted by first name, everywhere', async ({ page, request }) => {
  const anna = await createPerson(request, 'Anna', 'Xylophon');
  await createPerson(request, 'Zora', 'Xylander');
  expect(await tableNames(page, 'xyl')).toEqual(['Zora Xylander', 'Anna Xylophon']);

  await page.goto('/settings');
  const names = page.getByRole('region', { name: 'Names' });
  await names
    .getByRole('radiogroup', { name: 'Show' })
    .getByRole('radio', { name: 'Last, First' })
    .click();
  await names
    .getByRole('radiogroup', { name: 'Sort by' })
    .getByRole('radio', { name: 'First name' })
    .click();
  await expect(names.getByRole('radio', { name: 'First name' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  expect(await tableNames(page, 'xyl')).toEqual(['Xylophon, Anna', 'Xylander, Zora']);
  await page.goto(`/people/${anna.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Xylophon, Anna' })).toBeVisible();

  // The search palette finds her in either order.
  await page.goto('/search?q=anna%20xylophon');
  await expect(page.getByRole('link', { name: /Xylophon, Anna/ }).first()).toBeVisible();
});

test('columns: pick, order, remembered on this device, reset', async ({ page, request }) => {
  const bea = await createPerson(request, 'Bea', 'Xylograf', { birthday: '--03-12' });
  await request.post(`/api/v1/people/${bea.id}/contact-points`, {
    data: { kind: 'email', value: 'bea@example.com' },
  });
  await page.goto('/people');
  await page.getByLabel('Filter by name').fill('Xylograf');
  const table = page.getByRole('table');
  const headers = () => table.getByRole('columnheader').allInnerTexts();
  await expect(table.getByRole('row')).toHaveCount(2);
  expect(await headers()).toEqual(['NAME', 'ROLE · ORGANIZATION', 'TAGS', 'LAST CONTACT']);

  await page.getByRole('button', { name: 'Columns' }).click();
  const dialog = page.getByRole('dialog', { name: 'Columns' });
  await dialog.getByRole('checkbox', { name: 'Show “Tags”' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Show “Birthday”' }).check();
  await dialog.getByRole('checkbox', { name: 'Show “Email”' }).check();
  // Birthday to the front, with the buttons.
  await dialog.getByRole('button', { name: 'Move “Birthday” up' }).click();
  await dialog.getByRole('button', { name: 'Move “Birthday” up' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();

  const expected = ['NAME', 'BIRTHDAY', 'ROLE · ORGANIZATION', 'LAST CONTACT', 'EMAIL'];
  await expect.poll(headers).toEqual(expected);
  const row = table.getByRole('row').nth(1);
  await expect(row.getByRole('cell', { name: 'March 12' })).toBeVisible();
  await expect(row.getByRole('cell', { name: 'bea@example.com' })).toBeVisible();

  // Remembered after a reload.
  await page.reload();
  await page.getByLabel('Filter by name').fill('Xylograf');
  await expect.poll(headers).toEqual(expected);

  // Phone: the line under the name shows the first two columns (empty ones skipped).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('listitem').filter({ hasText: 'Bea Xylograf' })).toContainText(
    'March 12',
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Columns' }).click();
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect.poll(headers).toEqual(['NAME', 'ROLE · ORGANIZATION', 'TAGS', 'LAST CONTACT']);
});
