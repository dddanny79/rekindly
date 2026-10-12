import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

/** A fake OpenAI-compatible server (like LM Studio) answering by prompt type. */
async function fakeLlm() {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const text = body.includes('search words')
        ? 'Tochter\nMia\nSchule'
        : body.includes('connection test')
          ? 'OK'
          : body.includes('extract lasting facts')
            ? '- Ella Aitest: Hat eine Tochter namens Mia'
            : body.includes('prepare the user')
              ? '- Ella zieht im Herbst nach Leipzig'
              : 'Ella Aitest hat eine Tochter, Mia [1].';
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` };
}

test('AI with a local model: summary, fact suggestions, a question with sources', async ({
  page,
  request,
}) => {
  const llm = await fakeLlm();
  const { spaces } = await (await request.get('/api/v1/spaces')).json();
  const privateSpace = spaces.find((s: { nameKey: string }) => s.nameKey === 'seed.spaces.private');
  await request.patch(`/api/v1/spaces/${privateSpace.id}`, { data: { aiAllowed: true } });
  const ella = await (
    await request.post('/api/v1/people', {
      data: { spaceId: privateSpace.id, firstName: 'Ella', lastName: 'Aitest' },
    })
  ).json();
  await request.post('/api/v1/entries', {
    data: {
      kind: 'call',
      bodyMd: 'Ihre Tochter Mia kommt im Herbst in die Schule, sie ziehen nach Leipzig.',
      personIds: [ella.id],
    },
  });

  await page.goto('/settings/ai');
  const form = page.getByRole('form', { name: 'AI provider' });
  await form.getByRole('radio', { name: 'OpenAI-compatible' }).click();
  await form.getByLabel('Server address').fill(llm.url);
  await form.getByLabel('Model').fill('qwen3-8b');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Local model at 127.0.0.1')).toBeVisible();
  await page
    .getByRole('form', { name: 'AI provider' })
    .getByRole('button', { name: 'Test connection' })
    .click();
  await expect(page.getByText('Connection works. Answer: OK')).toBeVisible();

  await page.goto(`/people/${ella.id}`);
  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect(page.getByRole('status', { name: 'AI summary' })).toContainText(
    'Ella zieht im Herbst nach Leipzig',
  );

  // Local model: one click starts it.
  await page.getByRole('button', { name: 'Suggest facts' }).first().click();
  const suggestions = page.getByRole('status', { name: 'Suggested facts' });
  await expect(suggestions).toContainText('Hat eine Tochter namens Mia');
  await suggestions.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('region', { name: 'Facts' })).toContainText(
    'Hat eine Tochter namens Mia',
  );

  await page.goto('/search');
  await page.getByRole('button', { name: 'Ask a question …' }).click();
  await page.getByLabel('Question', { exact: true }).fill('Wer hat eine Tochter namens Mia?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const answer = page.getByRole('status', { name: 'Answer' });
  await expect(answer).toContainText('Ella Aitest hat eine Tochter, Mia [1].');
  await expect(answer.getByRole('link', { name: 'Ella Aitest' })).toBeVisible();

  // Off again, so other tests see no AI.
  await request.put('/api/v1/ai', { data: { provider: 'off' } });
  await new Promise((resolve) => llm.server.close(resolve));
});
