import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ContactImport, ContactImportPreview, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { monicaBundle, nextDue, readMonicaExport } from './monica';
import { apiBase, fetchMonica } from './monica-api';
import { ERIKA, LENA, MAX, monicaExport, OMA } from './monica-fixture';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
const servers: Server[] = [];
afterEach(() => {
  apps.splice(0).forEach((a) => a.cleanup());
  servers.splice(0).forEach((s) => s.close());
});

let EXPORT: ReturnType<typeof monicaExport>;
beforeAll(async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
  EXPORT = monicaExport(png.toString('base64'));
});

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

function upload(t: App, path: string, content: string, name: string, options: unknown = {}) {
  const form = new FormData();
  form.set('file', new File([content], name));
  form.set('options', JSON.stringify(options));
  return t.request(`/api/v1/contact-imports${path}`, { method: 'POST', body: form });
}

const personByName = async (t: App, name: string, query = '') => {
  const list = await t.json<{ people: { id: string; displayName: string }[] }>(
    t.request(`/api/v1/people${query}`),
  );
  const ref = list.people.find((p) => p.displayName === name);
  return ref ? t.json<Person>(t.request(`/api/v1/people/${ref.id}`)) : null;
};

describe('Monica export', () => {
  it('reads contacts, leaves out the own contact, maps the details', () => {
    const data = readMonicaExport(EXPORT);
    expect(data.contacts.map((c) => c.id)).toEqual([ERIKA, MAX, LENA, OMA]);
    const bundle = monicaBundle(data, 'de', new Date('2026-10-12T12:00:00Z'));
    const [erika, max, lena, oma] = bundle.contacts;
    expect(erika).toMatchObject({
      firstName: 'Erika',
      nickname: 'Riki',
      birthday: '--06-14',
      organization: ['Beispiel Planungs GmbH'],
      title: 'Architektin',
      note: 'Kletterpartnerin',
      favorite: true,
      tags: ['Klettern'],
      contactEveryDays: 30,
      metWhen: '2015-05-01',
      metThroughSourceId: LENA,
      listed: true,
      archived: false,
      facts: ['Essensvorlieben: vegetarisch', 'Trinkt lieber Tee als Kaffee.'],
    });
    expect(erika!.photo?.length).toBeGreaterThan(0);
    expect(erika!.points.map((p) => [p.kind, p.label, p.value])).toEqual([
      ['email', null, 'erika@example.com'],
      ['phone', null, '+49 30 1234567'],
      ['messenger', 'Whatsapp', '+49 170 1234567'],
    ]);
    expect(erika!.addresses[0]).toMatchObject({ label: 'Zuhause', country: 'Deutschland' });
    // Monica's automatic birthday reminder is left out.
    expect(erika!.reminders).toEqual([
      { title: 'Nach der neuen Wohnung fragen', dueOn: '2099-11-15', recurrence: 'none' },
    ]);
    expect(max).toMatchObject({ listed: false });
    expect(lena).toMatchObject({
      archived: true,
      birthday: null,
      facts: ['Geboren um 1990'],
      reminders: [{ title: 'Buch zurückgeben', dueOn: '2026-10-12', recurrence: 'none' }],
    });
    expect(oma).toMatchObject({ listed: false, facts: ['Verstorben am 2019-03-03'] });

    expect(bundle.entries.map((e) => [e.kind, e.direction, e.title, e.people])).toEqual([
      ['note', null, null, [ERIKA]],
      ['call', 'in', null, [ERIKA]],
      ['event', null, 'Neuer Job', [LENA]],
      ['message', null, null, [LENA]],
      ['meeting', null, 'Abendessen beim Italiener', [ERIKA, LENA]],
    ]);
    expect(bundle.entries[3]!.bodyMd).toBe(
      '**Ich:** Hast du Zeit am Samstag?\n\n**Lena Beispiel:** Ja, gern!',
    );
    // One relationship per pair; "child" is the reverse of "parent".
    expect(bundle.relationships).toEqual([
      { from: ERIKA, to: MAX, type: { key: 'partner' } },
      {
        from: ERIKA,
        to: OMA,
        type: { name: 'Großelternteil', reverseName: 'Enkelkind', symmetric: false },
      },
      { from: ERIKA, to: LENA, type: { key: 'parent' } },
    ]);
  });

  it('computes the next date of repeating reminders', () => {
    const r = (frequencyType: string, frequencyNumber: number, initialDate: string) => ({
      title: 'x',
      initialDate,
      frequencyType,
      frequencyNumber,
      active: true,
      automatic: false,
    });
    expect(nextDue(r('one_time', 1, '2026-01-01T00:00:00Z'), '2026-10-12')).toBeNull();
    expect(nextDue(r('week', 2, '2026-10-01T00:00:00Z'), '2026-10-12')).toBe('2026-10-15');
    expect(nextDue(r('month', 1, '2026-01-31T00:00:00Z'), '2026-10-12')).toMatch(/^2026-1[01]-/);
    expect(nextDue(r('year', 1, '2020-06-14T00:00:00Z'), '2026-10-12')).toBe('2027-06-14');
  });

  it('imports people, timeline, follow-ups, facts and relationships; undo removes them', async () => {
    const t = await app();
    const file = JSON.stringify(EXPORT);
    const preview = await t.json<ContactImportPreview>(upload(t, '/preview', file, 'monica.json'));
    expect(preview.format).toBe('monica');
    expect(preview.extras).toEqual({ entries: 5, reminders: 2, facts: 4, relationships: 3 });
    expect(preview.contacts.map((c) => [c.displayName, c.indirect, c.action])).toEqual([
      ['Erika (Riki) Musterfrau', false, 'create'],
      ['Max Mustermann', true, 'create'],
      ['Lena Beispiel', false, 'create'],
      ['Hilde Musterfrau', true, 'create'],
    ]);

    const result = await t.json<ContactImport>(
      upload(t, '', file, 'monica.json', { spaceId: t.privateSpace }),
      201,
    );
    expect(result).toMatchObject({ format: 'monica', created: 4 });

    const erika = (await personByName(t, 'Erika (Riki) Musterfrau'))!;
    expect(erika).toMatchObject({ favorite: true, contactEveryDays: 30, metWhen: '2015-05-01' });
    expect(erika.photoUrl).not.toBeNull();
    expect(erika.metThrough?.displayName).toBe('Lena Beispiel');
    expect(erika.facts.map((f) => f.text)).toEqual([
      'Essensvorlieben: vegetarisch',
      'Trinkt lieber Tee als Kaffee.',
    ]);
    expect(
      erika.relationships.map((r) => [r.label.name ?? r.label.nameKey, r.person.displayName]),
    ).toEqual(
      expect.arrayContaining([
        ['seed.relationshipTypes.partner', 'Max Mustermann'],
        ['Großelternteil', 'Hilde Musterfrau'],
        ['seed.relationshipTypes.parent', 'Lena Beispiel'],
      ]),
    );
    const timeline = await t.json<{ entries: { kind: string; people: unknown[] }[] }>(
      t.request(`/api/v1/entries?personId=${erika.id}`),
    );
    expect(timeline.entries.map((e) => e.kind).sort()).toEqual(['call', 'meeting', 'note']);
    expect(timeline.entries.find((e) => e.kind === 'meeting')!.people).toHaveLength(2);
    // Indirect contacts are not in the list; archived Lena only among the archived.
    const listed = await t.json<{ people: { displayName: string }[] }>(t.request('/api/v1/people'));
    expect(listed.people.map((p) => p.displayName)).toEqual(['Erika (Riki) Musterfrau']);

    const undone = await t.json<ContactImport>(
      t.request(`/api/v1/contact-imports/${result.id}/undo`, { method: 'POST' }),
    );
    expect(undone.undoneAt).not.toBeNull();
    const types = await t.json<{ relationshipTypes: { name: string | null }[] }>(
      t.request('/api/v1/relationship-types'),
    );
    expect(types.relationshipTypes.map((r) => r.name)).not.toContain('Großelternteil');
    expect((await t.json<{ people: unknown[] }>(t.request('/api/v1/people'))).people).toEqual([]);
  });

  it('completes an existing person by default, so the timeline comes along', async () => {
    const t = await app();
    const existing = await t.json<Person>(
      t.request('/api/v1/people', {
        method: 'POST',
        json: { spaceId: t.businessSpace, firstName: 'Erika', lastName: 'Musterfrau' },
      }),
      201,
    );
    const file = JSON.stringify(EXPORT);
    const preview = await t.json<ContactImportPreview>(upload(t, '/preview', file, 'monica.json'));
    expect(preview.contacts[0]).toMatchObject({
      action: 'merge',
      match: { personId: existing.id },
    });
    await t.json(upload(t, '', file, 'monica.json', { spaceId: t.privateSpace }), 201);
    const erika = await t.json<Person>(t.request(`/api/v1/people/${existing.id}`));
    expect(erika.contactPoints).toHaveLength(3);
    const timeline = await t.json<{ entries: unknown[] }>(
      t.request(`/api/v1/entries?personId=${existing.id}`),
    );
    expect(timeline.entries).toHaveLength(3);
    // The same file again adds no second copy of the timeline.
    await t.json(
      upload(t, '', file, 'monica.json', {
        spaceId: t.privateSpace,
        actions: { '1': 'skip', '2': 'skip', '3': 'skip' },
      }),
      201,
    );
    const again = await t.json<{ entries: unknown[] }>(
      t.request(`/api/v1/entries?personId=${existing.id}`),
    );
    expect(again.entries).toHaveLength(3);
  });
});

/** A fake Monica API with two contacts (one partial) on two pages, and a 429 once. */
function fakeMonica() {
  let limited = false;
  const contact = (id: number, first: string, last: string, extra: object = {}) => ({
    id,
    uuid: `u${id}`,
    object: 'contact',
    first_name: first,
    last_name: last,
    nickname: null,
    description: null,
    is_starred: false,
    is_partial: false,
    is_active: true,
    is_dead: false,
    is_me: false,
    ...extra,
  });
  const short = (id: number, first: string, last: string, partial = false) => ({
    id,
    first_name: first,
    last_name: last,
    is_partial: partial,
    information: { birthdate: { is_age_based: null, is_year_unknown: null, date: null } },
  });
  const pages: Record<string, unknown[][]> = {
    '/api/contacts': [
      [
        contact(1, 'Erika', 'Musterfrau', {
          stay_in_touch_frequency: 14,
          information: {
            relationships: {
              love: {
                total: 1,
                contacts: [
                  {
                    relationship: { id: 9, name: 'partner' },
                    contact: short(2, 'Max', 'Mustermann', true),
                  },
                ],
              },
              family: { total: 0, contacts: null },
            },
            dates: {
              birthdate: {
                is_age_based: false,
                is_year_unknown: false,
                date: '1985-10-24T00:00:00Z',
              },
            },
            career: { job: 'Architektin', company: 'Beispiel GmbH' },
            how_you_met: {
              general_information: 'Kletterhalle',
              first_met_date: { date: null },
              first_met_through_contact: null,
            },
          },
          addresses: [
            {
              name: 'Zuhause',
              street: 'Musterstraße 1',
              city: 'Berlin',
              province: null,
              postal_code: '10115',
              country: { iso: 'DE', name: 'Germany' },
            },
          ],
          tags: [{ name: 'Klettern' }],
          contactFields: [
            { content: 'erika@example.com', contact_field_type: { name: 'Email', type: 'email' } },
          ],
        }),
      ],
      [contact(3, 'Ich', 'Selbst', { is_me: true })],
    ],
    '/api/notes': [
      [
        {
          body: 'Mag Tee',
          is_favorited: false,
          created_at: '2026-01-05T10:00:00Z',
          contact: { id: 1 },
        },
      ],
    ],
    '/api/calls': [
      [
        {
          called_at: '2026-02-01T00:00:00Z',
          content: 'Kurz gesprochen',
          contact_called: false,
          contact: { id: 1 },
        },
      ],
    ],
    '/api/reminders': [[]],
    '/api/tasks': [[]],
    '/api/activities': [
      [
        {
          summary: 'Wandern',
          description: null,
          happened_at: '2026-05-01',
          attendees: {
            total: 2,
            contacts: [short(1, 'Erika', 'Musterfrau'), short(2, 'Max', 'Mustermann', true)],
          },
        },
      ],
    ],
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (req.headers.authorization !== 'Bearer geheim') return res.writeHead(401).end('{}');
    if (url.pathname === '/api/notes' && !limited) {
      limited = true;
      return res.writeHead(429, { 'retry-after': '1' }).end('{}');
    }
    const list = pages[url.pathname];
    if (!list) return res.writeHead(404).end('{}');
    const page = Number(url.searchParams.get('page') ?? 1);
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        data: list[page - 1] ?? [],
        meta: { current_page: page, last_page: list.length },
      }),
    );
  });
  servers.push(server);
  return new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );
}

describe('Monica API', () => {
  it('normalizes the address', () => {
    expect(apiBase('https://monica.example.org')).toBe('https://monica.example.org/api');
    expect(apiBase('https://monica.example.org/api/')).toBe('https://monica.example.org/api');
    expect(() => apiBase('ftp://x')).toThrow();
  });

  it('fetches contacts, partial contacts, notes, calls and activities (and waits on 429)', async () => {
    const url = await fakeMonica();
    const waits: number[] = [];
    const data = await fetchMonica({
      url,
      token: 'geheim',
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([1000]);
    expect(data.contacts.map((c) => [c.firstName, c.partial])).toEqual([
      ['Erika', false],
      ['Max', true],
    ]);
    expect(data.contacts[0]).toMatchObject({
      job: 'Architektin',
      company: 'Beispiel GmbH',
      howYouMet: 'Kletterhalle',
      stayInTouchDays: 14,
      tags: ['Klettern'],
      notes: [{ body: 'Mag Tee', favorite: false }],
      calls: [{ content: 'Kurz gesprochen', contactCalled: false }],
    });
    expect(data.relationships).toEqual([{ contact: '1', of: '2', type: 'partner' }]);
    expect(data.activities[0]!.participants).toEqual(['1', '2']);
  });

  it('the fetch endpoint returns a file the import reads; a wrong token is reported', async () => {
    const t = await app();
    const url = await fakeMonica();
    const bad = await t.request('/api/v1/contact-imports/monica-fetch', {
      method: 'POST',
      json: { url, token: 'falsch' },
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'monica_unauthorized' });
    const unreachable = await t.request('/api/v1/contact-imports/monica-fetch', {
      method: 'POST',
      json: { url: 'http://127.0.0.1:1', token: 'geheim' },
    });
    expect(unreachable.status).toBe(502);
    expect(await unreachable.json()).toMatchObject({ error: 'monica_unreachable' });

    const fetched = await t.request('/api/v1/contact-imports/monica-fetch', {
      method: 'POST',
      json: { url, token: 'geheim' },
    });
    expect(fetched.status).toBe(200);
    const file = await fetched.text();
    const preview = await t.json<ContactImportPreview>(
      upload(t, '/preview', file, 'monica-api.json'),
    );
    expect(preview).toMatchObject({
      format: 'monica',
      extras: { entries: 3, relationships: 1 },
    });
    await t.json(upload(t, '', file, 'monica-api.json', { spaceId: t.privateSpace }), 201);
    const erika = (await personByName(t, 'Erika Musterfrau'))!;
    expect(erika).toMatchObject({
      birthday: '1985-10-24',
      metWhere: 'Kletterhalle',
      contactEveryDays: 14,
    });
    expect(erika.relationships[0]!.person.displayName).toBe('Max Mustermann');
  }, 20_000);
});
