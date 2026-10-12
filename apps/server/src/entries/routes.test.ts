import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Fact, Organization, Person, PersonListItem, Reminder } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const person = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
  t.json<Person>(
    t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.businessSpace, firstName, lastName, ...extra },
    }),
    201,
  );
const getPerson = (id: string) => t.json<Person>(t.request(`/api/v1/people/${id}`));
const entry = (json: Record<string, unknown>) =>
  t.json<Entry>(t.request('/api/v1/entries', { method: 'POST', json }), 201);
const timeline = (query: string) =>
  t.json<{ entries: Entry[] }>(t.request(`/api/v1/entries?${query}`)).then((r) => r.entries);

describe('timeline entries', () => {
  it('a call with two people appears at both (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const thomas = await person('Thomas', 'Albers');
    const created = await entry({
      kind: 'call',
      direction: 'out',
      bodyMd: 'Budget für Q1 freigegeben.\n\nAngebot bis **Mitte Oktober**.',
      personIds: [jana.id, thomas.id],
    });
    expect(created.people.map((p) => p.displayName)).toEqual(['Jana Berger', 'Thomas Albers']);
    expect(created.spaceId).toBe(t.businessSpace);
    for (const id of [jana.id, thomas.id]) {
      expect((await timeline(`personId=${id}`)).map((e) => e.id)).toEqual([created.id]);
    }
  });

  it('defaults the time to now, sorts newest first and filters by kind', async () => {
    const jana = await person('Jana', 'Berger');
    const older = await entry({
      kind: 'note',
      bodyMd: 'Alt',
      personIds: [jana.id],
      occurredAt: '2026-01-01T10:00:00.000Z',
    });
    const newer = await entry({ kind: 'meeting', bodyMd: 'Neu', personIds: [jana.id] });
    expect(Date.now() - Date.parse(newer.occurredAt)).toBeLessThan(5000);
    expect((await timeline(`personId=${jana.id}`)).map((e) => e.id)).toEqual([newer.id, older.id]);
    expect((await timeline(`personId=${jana.id}&kinds=note,event`)).map((e) => e.id)).toEqual([
      older.id,
    ]);
    expect((await t.request('/api/v1/entries?kinds=gossip')).status).toBe(400);
  });

  it('allows a direction only for calls and messages', async () => {
    const jana = await person('Jana', 'Berger');
    const res = await t.request('/api/v1/entries', {
      method: 'POST',
      json: { kind: 'meeting', direction: 'in', bodyMd: 'x', personIds: [jana.id] },
    });
    expect(res.status).toBe(400);
    const call = await entry({ kind: 'call', direction: 'in', bodyMd: 'x', personIds: [jana.id] });
    const edited = await t.json<Entry>(
      t.request(`/api/v1/entries/${call.id}`, { method: 'PATCH', json: { kind: 'note' } }),
    );
    expect(edited.direction).toBeNull();
  });

  it('edits people, text and time, and soft-deletes', async () => {
    const jana = await person('Jana', 'Berger');
    const thomas = await person('Thomas', 'Albers');
    const e = await entry({ kind: 'note', bodyMd: 'Erst', personIds: [jana.id] });
    const edited = await t.json<Entry>(
      t.request(`/api/v1/entries/${e.id}`, {
        method: 'PATCH',
        json: { bodyMd: 'Dann', personIds: [thomas.id], occurredAt: '2026-09-19T08:00:00.000Z' },
      }),
    );
    expect(edited).toMatchObject({ bodyMd: 'Dann', occurredAt: '2026-09-19T08:00:00.000Z' });
    expect(await timeline(`personId=${jana.id}`)).toEqual([]);
    expect((await t.request(`/api/v1/entries/${e.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await timeline(`personId=${thomas.id}`)).toEqual([]);
    expect(t.db.query.entries.findFirst().sync()?.deletedAt).toBeTruthy();
  });

  it('rejects unknown people', async () => {
    const res = await t.request('/api/v1/entries', {
      method: 'POST',
      json: { kind: 'note', bodyMd: 'x', personIds: ['nope'] },
    });
    expect(await res.json()).toEqual({ error: 'unknown_person' });
  });

  it('shows the timeline of everyone in an organization and below it', async () => {
    const createOrg = (name: string, parentId?: string) =>
      t.json<Organization>(
        t.request('/api/v1/organizations', {
          method: 'POST',
          json: { spaceId: t.businessSpace, name, parentId },
        }),
        201,
      );
    const ag = await createOrg('Beispiel AG');
    const site = await createOrg('Standort Köln', ag.id);
    const jana = await person('Jana', 'Berger', { organizationId: site.id });
    const outsider = await person('Otto', 'Außen');
    const inside = await entry({
      kind: 'meeting',
      bodyMd: 'Standortbegehung',
      personIds: [jana.id],
    });
    await entry({ kind: 'note', bodyMd: 'Privat', personIds: [outsider.id] });
    const filed = await entry({
      kind: 'event',
      bodyMd: 'Messe',
      personIds: [outsider.id],
      organizationId: ag.id,
    });
    expect((await timeline(`organizationId=${ag.id}`)).map((e) => e.id).sort()).toEqual(
      [inside.id, filed.id].sort(),
    );
    expect((await timeline(`organizationId=${site.id}`)).map((e) => e.id)).toEqual([inside.id]);
  });
});

describe('last contact', () => {
  it('comes from the latest call, meeting or message — not from notes', async () => {
    const jana = await person('Jana', 'Berger');
    await entry({
      kind: 'call',
      direction: 'out',
      bodyMd: '# Budget\nfür Q1 ist **freigegeben**',
      personIds: [jana.id],
      occurredAt: '2026-10-02T12:20:00.000Z',
    });
    await entry({ kind: 'note', bodyMd: 'Nur eine Notiz', personIds: [jana.id] });
    const full = await getPerson(jana.id);
    expect(full.lastContact).toMatchObject({
      kind: 'call',
      direction: 'out',
      occurredAt: '2026-10-02T12:20:00.000Z',
      excerpt: 'Budget',
    });
    const { people } = await t.json<{ people: PersonListItem[] }>(t.request('/api/v1/people'));
    expect(people[0]!.lastContactAt).toBe('2026-10-02T12:20:00.000Z');
  });

  it('is null without contact entries', async () => {
    const jana = await person('Jana', 'Berger');
    await entry({ kind: 'event', bodyMd: 'Geburt', personIds: [jana.id] });
    expect((await getPerson(jana.id)).lastContact).toBeNull();
  });
});

describe('follow-ups', () => {
  it('created from an entry, listed on the person, done with a click (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const e = await entry({
      kind: 'call',
      bodyMd: 'Angebot Standort Köln schicken',
      personIds: [jana.id],
      reminder: { dueOn: '2026-10-25' },
    });
    let full = await getPerson(jana.id);
    expect(full.reminders).toEqual([
      expect.objectContaining({
        title: 'Angebot Standort Köln schicken',
        dueOn: '2026-10-25',
        entryId: e.id,
        doneAt: null,
      }),
    ]);
    const done = await t.json<Reminder>(
      t.request(`/api/v1/reminders/${full.reminders[0]!.id}`, {
        method: 'PATCH',
        json: { done: true },
      }),
    );
    expect(done.doneAt).toBeTruthy();
    full = await getPerson(jana.id);
    expect(full.reminders).toEqual([]);
    const { reminders } = await t.json<{ reminders: Reminder[] }>(
      t.request('/api/v1/reminders?status=done'),
    );
    expect(reminders.map((r) => r.id)).toEqual([done.id]);
  });

  it('can be added directly on a person, edited, reopened and deleted', async () => {
    const jana = await person('Jana', 'Berger');
    const r = await t.json<Reminder>(
      t.request(`/api/v1/people/${jana.id}/reminders`, {
        method: 'POST',
        json: { title: 'Zurückrufen', dueOn: '2026-10-12' },
      }),
      201,
    );
    expect(r.person?.id).toBe(jana.id);
    await t.request(`/api/v1/reminders/${r.id}`, { method: 'PATCH', json: { done: true } });
    const reopened = await t.json<Reminder>(
      t.request(`/api/v1/reminders/${r.id}`, {
        method: 'PATCH',
        json: { done: false, dueOn: '2026-10-20' },
      }),
    );
    expect(reopened).toMatchObject({ doneAt: null, dueOn: '2026-10-20' });
    expect((await t.request(`/api/v1/reminders/${r.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await getPerson(jana.id)).reminders).toEqual([]);
  });

  it('sorts open follow-ups by due date', async () => {
    const jana = await person('Jana', 'Berger');
    for (const [title, dueOn] of [
      ['Später', '2026-12-01'],
      ['Bald', '2026-10-13'],
    ]) {
      await t.request(`/api/v1/people/${jana.id}/reminders`, {
        method: 'POST',
        json: { title, dueOn },
      });
    }
    expect((await getPerson(jana.id)).reminders.map((r) => r.title)).toEqual(['Bald', 'Später']);
  });
});

describe('facts', () => {
  it('adds, pins, reorders and soft-deletes facts', async () => {
    const jana = await person('Jana', 'Berger');
    const base = `/api/v1/people/${jana.id}/facts`;
    const a = await t.json<Fact>(
      t.request(base, { method: 'POST', json: { text: 'Tochter Lea, Abi 2026' } }),
      201,
    );
    const b = await t.json<Fact>(
      t.request(base, { method: 'POST', json: { text: 'Trinkt keinen Kaffee', pinned: true } }),
      201,
    );
    expect((await getPerson(jana.id)).facts.map((f) => f.text)).toEqual([
      'Tochter Lea, Abi 2026',
      'Trinkt keinen Kaffee',
    ]);

    await t.json(
      t.request(`${base}/${a.id}`, {
        method: 'PATCH',
        json: { pinned: true, text: 'Tochter Lea, Abi 2026 mit 1,7' },
      }),
    );
    const { facts } = await t.json<{ facts: Fact[] }>(
      t.request(`${base}/order`, { method: 'PUT', json: { ids: [b.id, a.id] } }),
    );
    expect(facts.map((f) => [f.text, f.pinned])).toEqual([
      ['Trinkt keinen Kaffee', true],
      ['Tochter Lea, Abi 2026 mit 1,7', true],
    ]);

    expect((await t.request(`${base}/${b.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await getPerson(jana.id)).facts.map((f) => f.id)).toEqual([a.id]);
    expect(
      (await t.request(`${base}/${b.id}`, { method: 'PATCH', json: { pinned: false } })).status,
    ).toBe(404);
  });

  it('ignores ids of other people when reordering', async () => {
    const jana = await person('Jana', 'Berger');
    const otto = await person('Otto', 'Außen');
    const foreign = await t.json<Fact>(
      t.request(`/api/v1/people/${otto.id}/facts`, { method: 'POST', json: { text: 'fremd' } }),
      201,
    );
    await t.request(`/api/v1/people/${jana.id}/facts/order`, {
      method: 'PUT',
      json: { ids: [foreign.id] },
    });
    expect((await getPerson(otto.id)).facts[0]!.sort).toBe(0);
    expect((await getPerson(jana.id)).facts).toEqual([]);
  });
});
