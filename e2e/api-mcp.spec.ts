import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

test('API token for Claude: create, connect over MCP, revoke; AI permission per space', async ({
  page,
  request,
  playwright,
}) => {
  // Release Private for AI in Settings › Spaces.
  await page.goto('/settings/spaces');
  const allowAi = page.getByRole('checkbox', { name: 'AI allowed for Private' });
  if (!(await allowAi.isChecked())) await allowAi.click();
  await expect(allowAi).toBeChecked();
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const privateSpace = spaces.find((s: { nameKey: string }) => s.nameKey === 'seed.spaces.private');
  expect(privateSpace.aiAllowed).toBe(true);
  await request.post('/api/v1/people', {
    data: { spaceId: privateSpace.id, firstName: 'Mara', lastName: 'Mcptest' },
  });

  await page.goto('/settings/api');
  await expect(page.getByText('Visible to AI assistants: Private.')).toBeVisible();
  const form = page.getByRole('form', { name: 'New API token' });
  await form.getByLabel('Name').fill('Claude Laptop');
  await form.getByRole('button', { name: 'Create token' }).click();
  const created = page.getByRole('status').filter({ hasText: 'Token “Claude Laptop” created' });
  const token = (await created.locator('[data-copy-value]').first().textContent())!.trim();
  expect(token).toMatch(/^rkt_/);
  await expect(created).toContainText('claude mcp add --transport http rekindly');
  await created.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Claude Laptop' })).toContainText(
    'Read only',
  );

  // The token works for MCP, without the browser session.
  const mcp = await playwright.request.newContext({ baseURL: page.url() });
  const call = (method: string, params?: unknown) =>
    mcp.post('/mcp', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method, params },
    });
  const tools = await (await call('tools/list')).json();
  expect(tools.result.tools.map((t: { name: string }) => t.name)).toContain('get_person_briefing');
  const found = await (
    await call('tools/call', { name: 'search_people', arguments: { query: 'Mcptest' } })
  ).json();
  expect(found.result.content[0].text).toContain('Mara Mcptest');

  // Revoked: no access any more.
  await page.getByRole('button', { name: 'Revoke Claude Laptop' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /Remove|Revoke|Delete/ })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Claude Laptop' })).toHaveCount(0);
  expect((await call('tools/list')).status()).toBe(401);
  await mcp.dispose();
});

test('the API documentation lists the endpoints', async ({ page }) => {
  await page.goto('/api/docs');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('API');
  await expect(page.getByText('/api/v1/people/{id}').first()).toBeVisible();
});
