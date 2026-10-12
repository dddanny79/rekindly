import { expect, type APIRequestContext, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

interface Created {
  id: string;
  spaceId: string;
}

async function api<T = Created>(
  request: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
) {
  const res = await request.fetch(path, { method, data });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as T;
}

async function businessSpace(request: APIRequestContext) {
  const { spaces } = await api<{ spaces: { id: string; nameKey: string | null }[] }>(
    request,
    'GET',
    '/api/v1/spaces',
  );
  return spaces.find((s) => s.nameKey === 'seed.spaces.business')!.id;
}

async function person(request: APIRequestContext, firstName: string, lastName: string, extra = {}) {
  return api(request, 'POST', '/api/v1/people', {
    spaceId: await businessSpace(request),
    firstName,
    lastName,
    ...extra,
  });
}

const openPalette = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+k');
  return page.getByRole('dialog', { name: 'Command palette' });
};

test('“mueller köln einkauf” finds Jana Müller in the command palette (acceptance)', async ({
  page,
  request,
}) => {
  const spaceId = await businessSpace(request);
  const company = await api(request, 'POST', '/api/v1/organizations', {
    spaceId,
    name: 'Suchtest Handel GmbH',
  });
  const site = await api(request, 'POST', '/api/v1/organizations', {
    spaceId,
    name: 'Standort Köln',
    parentId: company.id,
  });
  const jana = await person(request, 'Jana', 'Müller', {
    organizationId: site.id,
    role: 'Einkauf',
  });

  await page.goto('/');
  const palette = await openPalette(page);
  await page.keyboard.type('mueller köln einkauf');
  const option = palette.getByRole('option', { name: /Jana Müller/ }).first();
  await expect(option).toContainText('Einkauf @ Standort Köln');
  await expect(option).toContainText('Suchtest Handel GmbH › Standort Köln');
  await expect(option.locator('mark').first()).toHaveText('Müller');
  await expect(option).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/people/${jana.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Jana Müller' })).toBeVisible();
});

test('a word only in a call note finds the person and shows the excerpt (acceptance)', async ({
  page,
  request,
}) => {
  const tom = await person(request, 'Tom', 'Telefonnotiz');
  await api(request, 'POST', '/api/v1/entries', {
    kind: 'call',
    direction: 'in',
    bodyMd: 'Er erzählt vom **Kranichzug** über dem Garten und fragt nach dem Angebot.',
    personIds: [tom.id],
  });

  await page.goto('/search');
  await page.getByRole('searchbox', { name: 'Search' }).fill('kranichz');
  const hit = page.getByRole('link', { name: /Tom Telefonnotiz/ });
  await expect(hit).toContainText('Call ·');
  await expect(hit).toContainText('Er erzählt vom Kranichzug über dem Garten');
  await expect(hit.locator('mark')).toHaveText('Kranichz');
  await expect(page).toHaveURL(/q=kranichz/);
  await hit.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tom Telefonnotiz' })).toBeVisible();
});

test('a deleted person is not found, after restoring from the trash it is (acceptance)', async ({
  page,
  request,
}) => {
  await person(request, 'Rita', 'Rückkehrerin');
  const search = page.getByRole('searchbox', { name: 'Search' });

  await page.goto('/search?q=rueckkehrerin');
  await page.getByRole('link', { name: /Rita Rückkehrerin/ }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/people');

  await page.goto('/search');
  await search.fill('rueckkehrerin');
  await expect(page.getByText('Nothing found for “rueckkehrerin”.')).toBeVisible();

  await page.getByRole('link', { name: 'Trash' }).first().click();
  const row = page.getByRole('listitem').filter({ hasText: 'Rita Rückkehrerin' });
  await expect(row).toContainText('Person');
  await row.getByRole('button', { name: 'Restore Rita Rückkehrerin' }).click();
  await expect(row).toHaveCount(0);

  await page.goto('/search?q=rueckkehrerin');
  await expect(page.getByRole('link', { name: /Rita Rückkehrerin/ })).toBeVisible();
});

test('Today lists due follow-ups and recently viewed people; “Log a call” starts a call', async ({
  page,
  request,
}) => {
  const paula = await person(request, 'Paula', 'Heute');
  await api(request, 'POST', `/api/v1/people/${paula.id}/reminders`, {
    title: 'Angebot nachfassen',
    dueOn: '2026-01-05',
  });

  await page.goto(`/people/${paula.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Paula Heute' })).toBeVisible();
  await page.getByRole('link', { name: 'Today' }).first().click();
  const due = page.getByRole('region', { name: 'Due', exact: true });
  await expect(due).toContainText('Angebot nachfassen');
  await expect(due).toContainText('Paula Heute');
  await expect(page.getByRole('region', { name: 'Recently viewed' })).toContainText('Paula Heute');

  await due.getByRole('checkbox', { name: 'Mark “Angebot nachfassen” as done' }).check();
  await expect(due).not.toContainText('Angebot nachfassen');

  // Command palette: “Log a call with …”, pick the person, the composer is ready.
  const palette = await openPalette(page);
  await palette.getByRole('option', { name: 'Log a call with …' }).click();
  await expect(palette.getByPlaceholder('Who did you talk to?')).toBeFocused();
  await page.keyboard.type('paula heu');
  await expect(palette.getByRole('option', { name: /Paula Heute/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/people/${paula.id}?compose=call`);
  await expect(page.getByLabel('New timeline entry')).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Type' })).toHaveValue('call');
});
