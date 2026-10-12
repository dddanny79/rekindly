import { afterEach, describe, expect, it } from 'vitest';
import type { CreateApiTokenResponse, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function setup() {
  const t = await createSignedInApp();
  apps.push(t);
  const post = <T>(path: string, json: unknown, status = 201) =>
    t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
  // Private is released for AI, Business is not.
  await t.json(
    t.request(`/api/v1/spaces/${t.privateSpace}`, { method: 'PATCH', json: { aiAllowed: true } }),
  );
  const jana = await post<Person>('/people', {
    spaceId: t.privateSpace,
    firstName: 'Jana',
    lastName: 'Berger',
  });
  const tom = await post<Person>('/people', {
    spaceId: t.privateSpace,
    firstName: 'Tom',
    lastName: 'Berger',
  });
  const secret = await post<Person>('/people', {
    spaceId: t.businessSpace,
    firstName: 'Bea',
    lastName: 'Berger',
  });
  await post(`/people/${jana.id}/facts`, { text: 'Trinkt nur grünen Tee' });
  await post(`/people/${jana.id}/relationships`, { personId: tom.id, typeId: t.typeId('sibling') });
  await post('/entries', {
    kind: 'call',
    bodyMd: 'Über den Umzug nach Leipzig gesprochen',
    personIds: [jana.id],
  });
  await post(`/people/${secret.id}/facts`, { text: 'Vertraulich' });
  const token = async (scope: 'read' | 'write') =>
    (
      await t.json<CreateApiTokenResponse>(
        t.request('/api/v1/api-tokens', {
          method: 'POST',
          json: { name: 'Claude', scope, expiresInDays: null },
        }),
        201,
      )
    ).token;
  return { t, jana, tom, secret, read: await token('read'), write: await token('write') };
}

interface RpcBody {
  result: { tools: { name: string; inputSchema: unknown }[] } & Record<string, unknown>;
  error: { code: number };
}
const body = async (res: Promise<Response>) => (await (await res).json()) as RpcBody;

let nextId = 1;
async function rpc(
  t: App,
  token: string | null,
  method: string,
  params?: unknown,
  extra: Record<string, string> = {},
) {
  const res = await t.app.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, ...(params ? { params } : {}) }),
  });
  return res;
}
const call = async (t: App, token: string, name: string, args: unknown) => {
  const res = await rpc(t, token, 'tools/call', { name, arguments: args });
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return { text: body.result.content[0]!.text, isError: !!body.result.isError };
};

describe('MCP server', () => {
  it('needs a token, speaks JSON-RPC, lists tools by scope', async () => {
    const { t, read, write } = await setup();
    const anonymous = await rpc(t, null, 'initialize', {});
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toContain('Bearer');

    const init = await body(
      rpc(t, read, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      }),
    );
    expect(init.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'Rekindly' },
    });
    const notification = await t.app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${read}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(notification.status).toBe(202);

    const readTools = (await body(rpc(t, read, 'tools/list'))).result.tools;
    expect(readTools.map((x) => x.name)).toEqual([
      'search_people',
      'get_person_briefing',
      'get_today',
    ]);
    expect(readTools[0]!.inputSchema).toMatchObject({ type: 'object', required: ['query'] });
    const writeTools = (await body(rpc(t, write, 'tools/list'))).result.tools;
    expect(writeTools).toHaveLength(5);

    const unknown = await body(rpc(t, read, 'resources/list'));
    expect(unknown.error.code).toBe(-32601);
    expect((await t.app.request('/mcp', { method: 'GET' })).status).toBe(405);
    expect((await rpc(t, read, 'ping', undefined, { origin: 'https://evil.example' })).status).toBe(
      403,
    );
  });

  it('“what do I know about Jana?”: search and briefing, only in AI-allowed spaces', async () => {
    const { t, read, jana, secret } = await setup();
    const found = await call(t, read, 'search_people', { query: 'Berger' });
    expect(found.text).toContain('Jana Berger');
    expect(found.text).toContain('Tom Berger');
    // Bea is in Business, which is not released for AI.
    expect(found.text).not.toContain('Bea');

    const brief = await call(t, read, 'get_person_briefing', { person_id: jana.id });
    expect(brief.isError).toBe(false);
    expect(brief.text).toContain('# Jana Berger');
    expect(brief.text).toContain('Trinkt nur grünen Tee');
    expect(brief.text).toContain('Geschwister: Tom Berger');
    expect(brief.text).toContain('Über den Umzug nach Leipzig gesprochen');
    expect(brief.text).toContain(`http://localhost:3000/people/${jana.id}`);

    const hidden = await call(t, read, 'get_person_briefing', { person_id: secret.id });
    expect(hidden).toEqual({ text: `No person with id ${secret.id}.`, isError: true });
    expect((await call(t, read, 'get_person_briefing', {})).isError).toBe(true);
  });

  it('writes only with a write token, and only to allowed spaces', async () => {
    const { t, read, write, jana, tom, secret } = await setup();
    const denied = await call(t, read, 'log_interaction', {
      person_id: jana.id,
      kind: 'note',
      text: 'x',
    });
    expect(denied).toEqual({ text: 'Unknown tool: log_interaction', isError: true });

    const saved = await call(t, write, 'log_interaction', {
      person_id: jana.id,
      kind: 'meeting',
      text: 'Kaffee am Markt',
      also_person_ids: [tom.id],
    });
    expect(saved.text).toContain('Saved meeting');
    const entries = await t.json<{ entries: { bodyMd: string; people: unknown[] }[] }>(
      t.request(`/api/v1/entries?personId=${tom.id}`),
    );
    expect(entries.entries[0]).toMatchObject({ bodyMd: 'Kaffee am Markt' });
    expect(entries.entries[0]!.people).toHaveLength(2);

    const followUp = await call(t, write, 'add_follow_up', {
      person_id: jana.id,
      title: 'Umzugskarte schicken',
      due_on: '2030-05-01',
    });
    expect(followUp.text).toContain('2030-05-01');
    expect(
      (
        await call(t, write, 'add_follow_up', {
          person_id: secret.id,
          title: 'x',
          due_on: '2030-05-01',
        })
      ).isError,
    ).toBe(true);

    const today = await call(t, read, 'get_today', {});
    expect(today.text).toContain('## Due follow-ups');
  });
});
