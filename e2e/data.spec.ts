import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

test('export everything as JSON and contacts as vCard; restore needs an empty instance', async ({
  page,
  request,
}) => {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  await request.post('/api/v1/people', {
    data: { spaceId: spaces[0].id, firstName: 'Ella', lastName: 'Export' },
  });
  await page.goto('/settings/data');
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download full export (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/^rekindly-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile((await json.path())!, 'utf8'));
  expect(exported).toMatchObject({ format: 'rekindly-export', version: 2 });
  expect(exported.data.people.length).toBeGreaterThan(0);

  const [vcf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download vCards' }).click(),
  ]);
  expect(await readFile((await vcf.path())!, 'utf8')).toContain('BEGIN:VCARD');

  // The E2E instance has data: restoring is refused with an explanation.
  await expect(page.getByText('This instance already has data.')).toBeVisible();
});

test('calendar subscription link shows follow-ups', async ({ page, request }) => {
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const person = await (
    await request.post('/api/v1/people', {
      data: { spaceId: spaces[0].id, firstName: 'Kalle', lastName: 'Kalender' },
    })
  ).json();
  await request.post(`/api/v1/people/${person.id}/reminders`, {
    data: { title: 'Vertrag prüfen', dueOn: '2030-01-15' },
  });

  await page.goto('/settings/sync');
  const calendar = page.getByRole('region', { name: 'Calendar subscription' });
  await calendar.getByRole('textbox', { name: 'Name' }).fill('Test-Kalender');
  await calendar.getByRole('checkbox', { name: /Include birthdays/ }).check();
  await calendar.getByRole('button', { name: 'Create subscription link' }).click();
  const shown = page
    .getByRole('status')
    .filter({ hasText: 'Subscription “Test-Kalender” created' });
  await expect(shown).toContainText('Subscribe on the iPhone');
  const url = (await shown.locator('[data-copy-value]').textContent())!.trim();
  expect(url).toMatch(/\/ics\/[A-Za-z0-9_-]+\.ics$/);

  const ics = await request.get(url, { headers: { cookie: '' } });
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('SUMMARY:Vertrag prüfen – Kalle Kalender');
  expect(body).toContain('DTSTART;VALUE=DATE:20300115');

  await shown.getByRole('button', { name: 'Done' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Test-Kalender' });
  await expect(row).toContainText('with birthdays');
});
