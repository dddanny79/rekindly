import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiAskResponse, AiSettings, Entry, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { complete } from './provider';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
const servers: Server[] = [];
afterEach(() => {
  apps.splice(0).forEach((a) => a.cleanup());
  servers.splice(0).forEach((s) => s.close());
});

/** A fake OpenAI-compatible / Anthropic server that records every request body. */
async function fakeProvider(reply: (body: string) => string) {
  const requests: { path: string; body: string; headers: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      requests.push({ path: req.url ?? '', body, headers: req.headers });
      const text = reply(body);
      const answer = req.url?.endsWith('/messages')
        ? { content: [{ type: 'text', text }] }
        : { choices: [{ message: { role: 'assistant', content: text } }] };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests };
}

async function setup(reply: (body: string) => string = () => 'OK') {
  const t = await createSignedInApp();
  apps.push(t);
  const post = <T>(path: string, json: unknown, status = 201) =>
    t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
  await t.json(
    t.request(`/api/v1/spaces/${t.privateSpace}`, { method: 'PATCH', json: { aiAllowed: true } }),
  );
  const jana = await post<Person>('/people', {
    spaceId: t.privateSpace,
    firstName: 'Jana',
    lastName: 'Berger',
  });
  const bea = await post<Person>('/people', {
    spaceId: t.businessSpace,
    firstName: 'Bea',
    lastName: 'Berger',
  });
  await post(`/people/${jana.id}/facts`, { text: 'Trinkt nur grünen Tee' });
  await post(`/people/${bea.id}/facts`, { text: 'Vertraulich: plant Kündigung' });
  const janaNote = await post<Entry>('/entries', {
    kind: 'call',
    bodyMd: 'Ihre Tochter Mia kommt im Herbst in die Schule. Sie zieht nach Leipzig.',
    personIds: [jana.id],
  });
  const beaNote = await post<Entry>('/entries', {
    kind: 'note',
    bodyMd: 'Bea sucht einen neuen Job',
    personIds: [bea.id],
  });
  const provider = await fakeProvider(reply);
  const configure = (input: object) =>
    t.request('/api/v1/ai', {
      method: 'PUT',
      json: { provider: 'openai', baseUrl: provider.url, model: 'test-model', ...input },
    });
  return { t, post, jana, bea, janaNote, beaNote, provider, configure };
}

describe('AI', () => {
  it('is off by default; settings keep the key secret and know local from cloud', async () => {
    const { t, provider, configure } = await setup();
    expect(await t.json<AiSettings>(t.request('/api/v1/ai'))).toMatchObject({
      provider: 'off',
      cloud: false,
    });
    expect(
      (await t.request('/api/v1/ai/ask', { method: 'POST', json: { question: 'Wer trinkt Tee?' } }))
        .status,
    ).toBe(409);

    const saved = await t.json<AiSettings>(configure({ apiKey: 'sk-geheim' }));
    expect(saved).toEqual({
      provider: 'openai',
      baseUrl: provider.url,
      model: 'test-model',
      hasApiKey: true,
      cloud: false,
      target: '127.0.0.1',
    });
    expect(JSON.stringify(await t.json(t.request('/api/v1/ai')))).not.toContain('geheim');
    const cloud = await t.json<AiSettings>(
      t.request('/api/v1/ai', {
        method: 'PUT',
        json: { provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'x' },
      }),
    );
    expect(cloud).toMatchObject({ cloud: true, target: 'openrouter.ai', hasApiKey: true });
    expect(
      (
        await t.request('/api/v1/ai', {
          method: 'PUT',
          json: { provider: 'anthropic', clearApiKey: true },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.request('/api/v1/ai', {
          method: 'PUT',
          json: { provider: 'openai', baseUrl: 'kein url', model: 'x' },
        })
      ).status,
    ).toBe(400);
    const anthropic = await t.json<AiSettings>(
      t.request('/api/v1/ai', { method: 'PUT', json: { provider: 'anthropic', apiKey: 'sk-ant' } }),
    );
    expect(anthropic).toMatchObject({
      provider: 'anthropic',
      cloud: true,
      target: 'Anthropic',
      model: 'claude-sonnet-5-5',
    });
  });

  it('connection test sends a fixed prompt only, with the key', async () => {
    const { t, provider, configure } = await setup();
    await configure({ apiKey: 'sk-geheim' });
    expect(
      await t.json<{ reply: string }>(t.request('/api/v1/ai/test', { method: 'POST' })),
    ).toEqual({ reply: 'OK' });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.headers.authorization).toBe('Bearer sk-geheim');
    expect(provider.requests[0]!.body).not.toMatch(/Jana|Bea|Tee/);
  });

  it('summarizes a person from facts and timeline', async () => {
    const { t, jana, provider, configure } = await setup(
      () => '- Jana zieht nach Leipzig\n- Trinkt nur grünen Tee',
    );
    await configure({});
    const res = await t.json<{ text: string }>(
      t.request(`/api/v1/ai/people/${jana.id}/summary`, { method: 'POST' }),
    );
    expect(res.text).toContain('Leipzig');
    const sent = JSON.parse(provider.requests[0]!.body);
    expect(sent.model).toBe('test-model');
    expect(sent.messages[1].content).toContain('Trinkt nur grünen Tee');
    expect(sent.messages[1].content).toContain('Tochter Mia');
    expect(sent.messages[0].content).toContain('German');
  });

  it('suggests facts from a note, matched to its people and without known ones', async () => {
    const { t, janaNote, configure } = await setup(
      () =>
        '- Jana Berger: Hat eine Tochter namens Mia\n- Jana Berger: Trinkt nur grünen Tee\n- Unbekannt: Irgendwas\n- none',
    );
    await configure({});
    const res = await t.json<{ suggestions: { person: { displayName: string }; text: string }[] }>(
      t.request(`/api/v1/ai/entries/${janaNote.id}/facts`, { method: 'POST' }),
    );
    expect(res.suggestions.map((s) => [s.person.displayName, s.text])).toEqual([
      ['Jana Berger', 'Hat eine Tochter namens Mia'],
    ]);
  });

  it('answers a question with numbered sources, via search words', async () => {
    const { t, provider, configure } = await setup((body) =>
      !body.includes('search words')
        ? 'Jana Berger hat eine Tochter, Mia [1].'
        : body.includes('segelt')
          ? 'Segeln\nBoot'
          : 'Tochter\nSchule\nKind',
    );
    await configure({});
    // "Kinder"/"eingeschult" are not in the notes; the search words from step one are.
    const res = await t.json<AiAskResponse>(
      t.request('/api/v1/ai/ask', {
        method: 'POST',
        json: { question: 'Wer hat Kinder, die eingeschult werden?' },
      }),
    );
    expect(res.answer).toContain('[1]');
    expect(res.sources.map((s) => [s.n, s.person.displayName])).toEqual([[1, 'Jana Berger']]);
    // Step one gets only the question; step two the notes.
    expect(provider.requests[0]!.body).not.toContain('Tochter Mia');
    expect(provider.requests[1]!.body).toContain('Tochter Mia');

    const nothing = await t.json<AiAskResponse>(
      t.request('/api/v1/ai/ask', { method: 'POST', json: { question: 'Wer segelt gern?' } }),
    );
    expect(nothing).toEqual({
      answer: 'Dazu habe ich in deinen Notizen nichts gefunden.',
      sources: [],
    });
  });

  it('a space without AI permission: provably no request to the provider', async () => {
    const { t, bea, beaNote, provider, configure } = await setup(() => 'antwort');
    await configure({});
    expect(
      (await t.request(`/api/v1/ai/people/${bea.id}/summary`, { method: 'POST' })).status,
    ).toBe(403);
    expect(
      (await t.request(`/api/v1/ai/entries/${beaNote.id}/facts`, { method: 'POST' })).status,
    ).toBe(403);
    expect(provider.requests).toHaveLength(0);
    // A question may be asked, but Bea's data is not part of it.
    await t.json(
      t.request('/api/v1/ai/ask', {
        method: 'POST',
        json: { question: 'Wer hat eine Tochter? Berger' },
      }),
    );
    expect(provider.requests.length).toBeGreaterThan(0);
    for (const r of provider.requests)
      expect(r.body).not.toMatch(/Bea|Vertraulich|Kündigung|neuen Job/);
    const before = provider.requests.length;
    // With no released space at all, nothing is sent.
    await t.json(
      t.request(`/api/v1/spaces/${t.privateSpace}`, {
        method: 'PATCH',
        json: { aiAllowed: false },
      }),
    );
    expect(
      (await t.request('/api/v1/ai/ask', { method: 'POST', json: { question: 'Wer trinkt Tee?' } }))
        .status,
    ).toBe(403);
    expect(provider.requests).toHaveLength(before);
  });

  it('talks to Anthropic in its format', async () => {
    const provider = await fakeProvider(() => 'Hallo');
    const text = await complete(
      { provider: 'anthropic', baseUrl: provider.url, model: 'claude-test', apiKey: 'sk-ant' },
      { system: 'sys', user: 'hi' },
    );
    expect(text).toBe('Hallo');
    expect(provider.requests[0]!.path).toBe('/v1/messages');
    expect(provider.requests[0]!.headers['x-api-key']).toBe('sk-ant');
    expect(JSON.parse(provider.requests[0]!.body)).toMatchObject({
      model: 'claude-test',
      system: 'sys',
    });
  });
});
