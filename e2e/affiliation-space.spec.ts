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
  return (await res.json()) as T;
}

test('an organization from another space moves the person there', async ({ page, request }) => {
  const { spaces } = await api<{ spaces: { id: string; nameKey: string | null }[] }>(
    request,
    'GET',
    '/api/v1/spaces',
  );
  const space = (key: string) => spaces.find((s) => s.nameKey === `seed.spaces.${key}`)!.id;
  await api(request, 'POST', '/api/v1/organizations', {
    spaceId: space('business'),
    name: 'Bereichstest GmbH',
  });
  const andrea = await api(request, 'POST', '/api/v1/people', {
    spaceId: space('private'),
    firstName: 'Andrea',
    lastName: 'Bereich',
  });

  await page.goto(`/people/${andrea.id}`);
  const orgs = page.getByRole('region', { name: 'Organizations', exact: true });
  await orgs.getByRole('button', { name: 'Add organization' }).click();
  await orgs.getByRole('combobox', { name: 'Organization' }).fill('Bereichstest');
  const option = orgs.getByRole('listbox').getByRole('option', { name: /Bereichstest GmbH/ });
  await expect(option).toContainText('Business');
  await option.click();
  await expect(orgs.getByRole('note')).toHaveText(
    'Bereichstest GmbH is in the space Business, Andrea Bereich in Private. Saving moves Andrea Bereich to Business.',
  );
  await orgs.getByRole('textbox', { name: 'Role' }).fill('Einkauf');
  await orgs.getByRole('button', { name: 'Move and save' }).click();

  await expect(orgs.getByRole('link', { name: 'Bereichstest GmbH' })).toBeVisible();
  await expect(page.locator('header .kicker').first()).toContainText('Business');
  const person = await api<{ spaceId: string }>(request, 'GET', `/api/v1/people/${andrea.id}`);
  expect(person.spaceId).toBe(space('business'));
});
