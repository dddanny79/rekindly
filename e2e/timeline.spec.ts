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

async function person(
  request: APIRequestContext,
  firstName: string,
  lastName: string,
  extra: object = {},
) {
  return api(request, 'POST', '/api/v1/people', {
    spaceId: await businessSpace(request),
    firstName,
    lastName,
    ...extra,
  });
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

test('a call with two people, keyboard only, appears at both', async ({ page, request }) => {
  const tara = await person(request, 'Tara', 'Timeline');
  const theo = await person(request, 'Theo', 'Telefon');

  await page.goto(`/people/${tara.id}`);
  const input = page.getByLabel('New timeline entry');
  await input.focus();
  await page.keyboard.type('/call Budget approved, decided together with @Theo T');
  await expect(page.getByRole('option', { name: /Theo Telefon/ })).toBeVisible();
  await page.keyboard.press('Enter'); // picks the mention
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('call');
  await page.keyboard.type('. Offer by mid-October.');
  await page.keyboard.press('Enter'); // saves

  const timeline = region(page, 'Timeline');
  await expect(timeline.getByRole('listitem').first()).toContainText(
    'Budget approved, decided together with Theo Telefon. Offer by mid-October.',
  );
  await expect(timeline.getByRole('listitem').first()).toContainText('↗ Call');
  await expect(input).toHaveValue('');

  await page.goto(`/people/${theo.id}`);
  await expect(region(page, 'Timeline').getByRole('listitem').first()).toContainText(
    'Budget approved',
  );
  await expect(region(page, 'Timeline').getByRole('listitem').first()).toContainText(
    'With Tara Timeline',
  );
  // Last contact in Theo's briefing, too.
  await expect(page.getByTestId('briefing-last-contact')).toContainText('Call');
});

test('a follow-up from an entry shows in the briefing and is done with a click', async ({
  page,
  request,
}) => {
  const fiona = await person(request, 'Fiona', 'Folge');
  await page.goto(`/people/${fiona.id}`);
  await page.getByLabel('New timeline entry').fill('Send the offer for the Cologne site /wv 2w');
  await expect(page.getByLabel('Follow-up', { exact: true })).toHaveValue(isoDay(inDays(14)));
  await page.getByLabel('New timeline entry').press('Enter');

  const briefing = region(page, 'Briefing');
  const checkbox = briefing.getByRole('checkbox', { name: /Send the offer for the Cologne site/ });
  await expect(checkbox).toBeVisible();
  // The command is not part of the saved text.
  const saved = region(page, 'Timeline').getByRole('listitem').first();
  await expect(saved).toContainText('Send the offer for the Cologne site');
  await expect(saved).not.toContainText('/wv');

  await checkbox.check();
  await expect(checkbox).toHaveCount(0);
});

test('questions for next time: /ask in the composer, in the briefing, asked with an answer', async ({
  page,
  request,
}) => {
  const quinn = await person(request, 'Quinn', 'Question');
  await page.goto(`/people/${quinn.id}`);
  const input = page.getByLabel('New timeline entry');
  await input.fill('Talked about the new flat\n/ask How did the move go?');
  await expect(page.getByTestId('composer-questions')).toContainText('Ask next time · 1');
  await input.press('Enter');

  const briefing = region(page, 'Briefing');
  const questions = briefing.getByTestId('briefing-questions');
  await expect(questions).toContainText('How did the move go?');
  // The rest of the text is a normal note, without the question.
  const saved = region(page, 'Timeline').getByRole('listitem').first();
  await expect(saved).toContainText('Talked about the new flat');
  await expect(saved).not.toContainText('How did the move go?');

  // A second one from the briefing itself.
  await briefing.getByRole('button', { name: 'Add a question for next time' }).click();
  await briefing.getByLabel('New question').fill('Is the cat settled in?');
  await briefing.getByLabel('New question').press('Enter');
  await expect(questions.getByRole('listitem')).toHaveCount(2);
  await briefing.getByLabel('New question').press('Escape');

  // On a phone, the questions are visible without scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(questions.getByText('How did the move go?')).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Asked without an answer: only gone from the briefing.
  await briefing.getByRole('checkbox', { name: 'Mark “Is the cat settled in?” as asked' }).check();
  await briefing.getByRole('button', { name: 'Asked' }).click();
  await expect(questions.getByRole('listitem')).toHaveCount(1);
  await expect(region(page, 'Timeline').getByRole('listitem')).toHaveCount(1);

  // Asked with an answer: a note with question and answer in the timeline.
  await briefing.getByRole('checkbox', { name: 'Mark “How did the move go?” as asked' }).check();
  await briefing
    .getByLabel('Answer to “How did the move go?”')
    .fill('Fine, the cellar is still full.');
  await briefing.getByLabel('Answer to “How did the move go?”').press('Enter');
  await expect(briefing.getByTestId('briefing-questions')).toHaveCount(0);
  const note = region(page, 'Timeline').getByRole('listitem').first();
  await expect(note).toContainText('How did the move go?');
  await expect(note).toContainText('Fine, the cellar is still full.');
});

test('briefing: last contact, next birthday with and without year, overdue rhythm', async ({
  page,
  request,
}) => {
  const birthday = inDays(5);
  const withYear = await person(request, 'Bea', 'Briefing');
  await api(request, 'PATCH', `/api/v1/people/${withYear.id}`, {
    birthday: `1980-${pad(birthday.getMonth() + 1)}-${pad(birthday.getDate())}`,
    contactEveryDays: 30,
  });
  await api(request, 'POST', '/api/v1/entries', {
    kind: 'meeting',
    bodyMd: '# Site visit\nSecond floor, 140 people.',
    personIds: [withYear.id],
    occurredAt: inDays(-45).toISOString(),
  });
  await api(request, 'POST', '/api/v1/entries', {
    kind: 'note',
    bodyMd: 'Only a note, not a contact',
    personIds: [withYear.id],
  });

  await page.goto(`/people/${withYear.id}`);
  await expect(page.getByTestId('briefing-last-contact')).toContainText('Meeting · Site visit');
  const turns = birthday.getFullYear() - 1980;
  await expect(page.getByTestId('briefing-birthday')).toContainText(`in 5 days · turns ${turns}`);
  await expect(page.getByTestId('briefing-rhythm')).toContainText('overdue by 15 days');

  const noYear = await person(request, 'Nico', 'Ohnejahr');
  await api(request, 'PATCH', `/api/v1/people/${noYear.id}`, {
    birthday: `--${pad(birthday.getMonth() + 1)}-${pad(birthday.getDate())}`,
    contactEveryDays: 90,
  });
  await page.goto(`/people/${noYear.id}`);
  await expect(page.getByTestId('briefing-birthday')).toContainText('in 5 days');
  await expect(page.getByTestId('briefing-birthday')).not.toContainText('turns');
  // A new rhythm without any conversation is not due yet; one click starts a call entry.
  await expect(page.getByTestId('briefing-rhythm')).toContainText('no conversation logged yet');
  await expect(page.getByTestId('briefing-rhythm')).toContainText('next by');
  await expect(page.getByTestId('briefing-rhythm')).not.toContainText('overdue');
  await expect(page.getByTestId('briefing-last-contact')).toHaveCount(0);
  await page.getByTestId('briefing-rhythm').getByRole('link', { name: 'log a call' }).click();
  await expect(page.getByLabel('New timeline entry')).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Type' })).toHaveValue('call');
});

test('facts: add, pin into the briefing, reorder with the keyboard', async ({ page, request }) => {
  const f = await person(request, 'Fabian', 'Fakt');
  await page.goto(`/people/${f.id}`);
  const facts = region(page, 'Facts');
  for (const text of ['Daughter Lea, finished school', 'Drinks no coffee']) {
    await facts.getByLabel('Add fact').fill(text);
    await facts.getByLabel('Add fact').press('Enter');
    await expect(facts.getByRole('list')).toContainText(text);
  }
  await facts.getByRole('button', { name: /Pin “Drinks no coffee”/ }).click();
  await expect(region(page, 'Briefing')).toContainText('Drinks no coffee');
  await expect(region(page, 'Briefing')).not.toContainText('Daughter Lea');

  // Keyboard drag: Space, ArrowUp, Space — each step after dnd-kit announced the last one.
  const announcer = page.locator('[id^="DndLiveRegion"]');
  await facts.getByRole('button', { name: /Move “Drinks no coffee”/ }).focus();
  await page.keyboard.press('Space');
  await expect(announcer).toContainText('Draggable item');
  const pickedUp = await announcer.textContent();
  await page.keyboard.press('ArrowUp');
  await expect(announcer).not.toHaveText(pickedUp ?? '');
  await page.keyboard.press('Space');
  await expect(facts.getByRole('listitem').first()).toContainText('Drinks no coffee');
  await page.reload();
  await expect(region(page, 'Facts').getByRole('listitem').first()).toContainText(
    'Drinks no coffee',
  );
});

test('the organization page shows the timeline of its people', async ({ page, request }) => {
  const space = await businessSpace(request);
  const org = await api(request, 'POST', '/api/v1/organizations', {
    spaceId: space,
    name: 'Timeline GmbH',
  });
  const olga = await person(request, 'Olga', 'Orga', { organizationId: org.id, role: 'CEO' });
  await api(request, 'POST', '/api/v1/entries', {
    kind: 'call',
    direction: 'in',
    bodyMd: 'Asked about the contract',
    personIds: [olga.id],
  });
  await page.goto(`/organizations/${org.id}`);
  const timeline = region(page, 'Timeline');
  await expect(timeline).toContainText('Asked about the contract');
  await timeline.getByRole('button', { name: 'Notes' }).click();
  await expect(timeline).not.toContainText('Asked about the contract');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the briefing is visible without scrolling at 375 px', async ({ page, request }) => {
    const m = await person(request, 'Mia', 'Mobil');
    await api(request, 'PATCH', `/api/v1/people/${m.id}`, {
      birthday: '1990-12-24',
      contactEveryDays: 90,
      summary: 'Head of purchasing',
    });
    await api(request, 'POST', `/api/v1/people/${m.id}/facts`, {
      text: 'Daughter Lea, finished school 2026',
      pinned: true,
    });
    await api(request, 'POST', `/api/v1/people/${m.id}/facts`, {
      text: 'Drinks no coffee, only green tea',
      pinned: true,
    });
    await api(request, 'POST', `/api/v1/people/${m.id}/reminders`, {
      title: 'Send offer for the site',
      dueOn: isoDay(inDays(1)),
    });
    await api(request, 'POST', '/api/v1/entries', {
      kind: 'call',
      direction: 'out',
      bodyMd: 'Budget approved, offer by mid-October.',
      personIds: [m.id],
    });

    await page.goto(`/people/${m.id}`);
    const briefing = region(page, 'Briefing');
    await expect(briefing).toContainText('Send offer for the site');
    const box = (await briefing.boundingBox())!;
    const tabBar = 56;
    expect(box.y + box.height).toBeLessThanOrEqual(812 - tabBar);
    const [scrollWidth, width] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      innerWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
});
