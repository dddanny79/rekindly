import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

test('connect a device: app password, then the address book answers with it', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('/settings/sync');
  await page.getByLabel('Device').fill('Test-iPhone');
  await page.getByRole('radio', { name: 'Only these:' }).check();
  await page.getByRole('checkbox', { name: 'Business' }).check();
  await page.getByRole('button', { name: 'Create password' }).click();

  const shown = page.getByRole('status').filter({ hasText: 'Password for “Test-iPhone” created' });
  await expect(shown).toBeVisible();
  await expect(shown).toContainText('Set up the iPhone');
  await expect(shown).toContainText(`CardDAV address ${baseURL}/dav/`);
  const password = (await shown.locator('[data-copy-value]').nth(2).textContent())!.trim();
  const username = (await shown.locator('[data-copy-value]').nth(1).textContent())!.trim();
  expect(password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  expect(username).toBe('erika@example.com');

  // A CardDAV request with these credentials works (no session cookie).
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const res = await request.fetch(`${baseURL}/dav/addressbooks/contacts/`, {
    method: 'PROPFIND',
    headers: { authorization: auth, depth: '0', cookie: '' },
  });
  expect(res.status()).toBe(207);
  expect(await res.text()).toContain('Test-iPhone');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Test-iPhone', { exact: true })).toBeVisible();
  await expect(page.getByText(/Business · created/)).toBeVisible();
  await page.getByRole('button', { name: 'Revoke Test-iPhone' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('No device connected yet.')).toBeVisible();
  const after = await request.fetch(`${baseURL}/dav/addressbooks/contacts/`, {
    method: 'PROPFIND',
    headers: { authorization: auth, depth: '0', cookie: '' },
  });
  expect(after.status()).toBe(401);
});

test('changes from a device are logged in the timeline, hidden by default', async ({
  page,
  request,
  baseURL,
}) => {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const person = await (
    await request.post('/api/v1/people', {
      data: { spaceId: spaces[0].id, firstName: 'Sina', lastName: 'Sync' },
    })
  ).json();
  await request.post('/api/v1/entries', {
    data: { kind: 'note', bodyMd: 'Normale Notiz', personIds: [person.id] },
  });
  const created = await (
    await request.post('/api/v1/app-passwords', { data: { name: 'E2E', spaceIds: null } })
  ).json();
  const auth = `Basic ${Buffer.from(`${created.username}:${created.password}`).toString('base64')}`;
  const url = `${baseURL}/dav/addressbooks/contacts/${person.id}.vcf`;
  const get = await request.fetch(url, { headers: { authorization: auth, cookie: '' } });
  const card = (await get.text()).replace(
    'END:VCARD',
    'TEL;type=CELL:+49 170 5550199\r\nEND:VCARD',
  );
  const put = await request.fetch(url, {
    method: 'PUT',
    data: card,
    headers: { authorization: auth, cookie: '', 'if-match': get.headers()['etag']! },
  });
  expect(put.status()).toBe(204);

  await page.goto(`/people/${person.id}`);
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(timeline).toContainText('Normale Notiz');
  await expect(timeline).not.toContainText('Changed via sync');
  await expect(timeline).toContainText('1 change from sync hidden');
  await timeline.getByRole('button', { name: 'show' }).click();
  await expect(timeline).toContainText('Changed via sync');
  await expect(timeline).toContainText('Phone added: +49 170 5550199');
  await timeline.getByRole('button', { name: 'Hide changes from sync' }).click();
  await expect(timeline).not.toContainText('Changed via sync');
});
