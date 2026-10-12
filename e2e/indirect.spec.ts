import { expect, type APIRequestContext, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

async function api<T = { id: string }>(
  request: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
) {
  const res = await request.fetch(path, { method, data });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as T;
}

const pad = (n: number) => String(n).padStart(2, '0');

test('an indirect contact from the relationship form (acceptance)', async ({ page, request }) => {
  const { spaces } = await api<{ spaces: { id: string; nameKey: string | null }[] }>(
    request,
    'GET',
    '/api/v1/spaces',
  );
  const jana = await api(request, 'POST', '/api/v1/people', {
    spaceId: spaces.find((s) => s.nameKey === 'seed.spaces.business')!.id,
    firstName: 'Jana',
    lastName: 'Bergfeld',
  });

  // Create Lea as Jana's child without leaving the page.
  await page.goto(`/people/${jana.id}`);
  const relationships = page.getByRole('region', { name: 'Relationships', exact: true });
  await relationships.getByRole('button', { name: 'Add relationship' }).click();
  await relationships.getByRole('combobox', { name: 'Person' }).fill('Lea Bergfeld');
  await expect(relationships.getByRole('listbox').getByRole('option')).toHaveText([
    'Add “Lea Bergfeld” as indirect contact',
    'Add “Lea Bergfeld” as contact',
  ]);
  await page.keyboard.press('Enter');
  await expect(relationships).toContainText('Lea Bergfeld · new indirect contact');
  await relationships.getByLabel('Lea Bergfeld is … of Jana Bergfeld').selectOption('Child');
  await relationships.getByRole('button', { name: 'Save' }).click();
  const link = relationships.getByRole('link', { name: 'Lea Bergfeld' });
  await expect(link).toBeVisible();
  await expect(page).toHaveURL(`/people/${jana.id}`);

  // Not in the people list, only with the “Indirect” filter.
  await page.goto('/people');
  const table = page.getByRole('table');
  await expect(table).toContainText('Jana Bergfeld');
  await expect(table).not.toContainText('Lea Bergfeld');
  await page.getByRole('button', { name: 'Indirect' }).click();
  await expect(table).toContainText('Lea Bergfeld');
  await page.getByRole('button', { name: 'Indirect' }).click();

  // Search shows through whom she is known.
  await page.goto('/search?q=lea%20bergfeld');
  await expect(page.getByRole('link', { name: /Lea Bergfeld/ })).toContainText(
    'Child of Jana Bergfeld',
  );

  // Birthday in the next 14 days → Today, with the relationship.
  const people = await api<{ people: { id: string; displayName: string }[] }>(
    request,
    'GET',
    '/api/v1/people?listed=indirect',
  );
  const lea = people.people.find((p) => p.displayName === 'Lea Bergfeld')!;
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  await api(request, 'PATCH', `/api/v1/people/${lea.id}`, {
    birthday: `2008-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
  });
  await page.goto('/');
  const birthdays = page.getByRole('region', { name: 'Birthdays · 14 days' });
  await expect(birthdays).toContainText('Lea Bergfeld');
  await expect(birthdays).toContainText('Child of Jana Bergfeld');

  // Make her a contact → she is in the people list.
  await birthdays.getByRole('link', { name: /Lea Bergfeld/ }).click();
  await expect(page.getByText('Indirect contact', { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Child of Jana Bergfeld');
  await page.getByRole('button', { name: 'Make a contact' }).click();
  await expect(page.getByRole('button', { name: 'Make a contact' })).toHaveCount(0);
  await page.goto('/people');
  await expect(page.getByRole('table')).toContainText('Lea Bergfeld');
});
