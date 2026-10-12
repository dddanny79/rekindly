import { expect, type APIRequestContext, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

async function person(request: APIRequestContext, firstName: string, lastName: string, patch = {}) {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const p = await (
    await request.post('/api/v1/people', { data: { spaceId: spaces[0].id, firstName, lastName } })
  ).json();
  if (Object.keys(patch).length) await request.patch(`/api/v1/people/${p.id}`, { data: patch });
  return p as { id: string };
}

test('possible duplicates: merge a pair without losing the timeline', async ({ page, request }) => {
  const a = await person(request, 'Doris', 'Doppelt', { summary: 'Nachbarin' });
  const b = await person(request, 'Doris', 'Doppelt', {
    summary: 'Chorleiterin',
    birthday: '1970-03-04',
  });
  await request.post(`/api/v1/people/${a.id}/contact-points`, {
    data: { kind: 'email', value: 'doris@example.com' },
  });
  await request.post(`/api/v1/people/${b.id}/contact-points`, {
    data: { kind: 'phone', value: '+49 170 5550123' },
  });
  await request.post('/api/v1/entries', {
    data: { kind: 'note', bodyMd: 'Erstes Treffen im Treppenhaus', personIds: [a.id] },
  });
  await request.post('/api/v1/entries', {
    data: { kind: 'call', bodyMd: 'Telefonat über den Chor', personIds: [b.id] },
  });

  await page.goto('/people');
  await page.getByRole('link', { name: /possible duplicate/ }).click();
  const pair = page.getByRole('listitem', { name: 'Doris Doppelt / Doris Doppelt' });
  await expect(pair).toContainText('same name');
  await pair.getByRole('button', { name: 'Merge …' }).click();

  const dialog = page.getByRole('dialog', { name: 'Merge people' });
  await expect(dialog.getByText('Who is this?')).toBeVisible();
  await dialog.getByRole('radio', { name: 'Chorleiterin' }).check();
  await dialog.getByRole('button', { name: 'Merge', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Doris Doppelt' })).toBeVisible();
  await expect(page.getByText('Chorleiterin')).toBeVisible();
  await expect(page.getByText('Erstes Treffen im Treppenhaus').first()).toBeVisible();
  await expect(page.getByText('Telefonat über den Chor').first()).toBeVisible();
  const contact = page.getByRole('region', { name: 'Contact' });
  await expect(contact.getByRole('link', { name: 'doris@example.com' })).toBeVisible();
  await expect(contact.getByRole('link', { name: '+49 170 5550123' })).toBeVisible();

  await page.goto('/duplicates');
  await expect(page.getByRole('listitem', { name: 'Doris Doppelt / Doris Doppelt' })).toHaveCount(
    0,
  );
});

test('a pair marked as different people disappears from the list', async ({ page, request }) => {
  await person(request, 'Frieda', 'Fremd');
  await person(request, 'Frieda', 'Fremd');
  await page.goto('/duplicates');
  const pair = page.getByRole('listitem', { name: 'Frieda Fremd / Frieda Fremd' });
  await pair.getByRole('button', { name: 'Different people' }).click();
  await expect(pair).toHaveCount(0);
});

test('merge from the person page with someone picked by hand', async ({ page, request }) => {
  const gustav = await person(request, 'Gustav', 'Gleich');
  await person(request, 'Gustl', 'Gleichmann', { nickname: 'Gustl' });
  await page.goto(`/people/${gustav.id}`);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Merge with another person …' }).click();
  const pick = page.getByRole('dialog', { name: 'Merge Gustav Gleich with …' });
  await pick.getByRole('combobox', { name: 'Person' }).fill('Gleichmann');
  await pick.getByRole('option', { name: /Gleichmann/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Merge people' });
  // Gustav stays and keeps his name; the nickname comes from the other one.
  await expect(dialog.getByRole('radiogroup', { name: 'Who stays' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Gustav \(Gustl\) Gleich/ }),
  ).toBeVisible();
});
