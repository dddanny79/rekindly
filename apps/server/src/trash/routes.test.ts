import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Organization, Person, SearchResponse, TrashItem } from '@app/shared';
import { entries, people, relationshipTypes } from '../db/schema';
import { createSignedInApp } from '../test/helpers';
import { purgeExpired } from './service';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const post = <T>(path: string, json?: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
async function del(path: string, status = 204) {
  const res = await t.request(`/api/v1${path}`, { method: 'DELETE' });
  expect(res.status, await res.clone().text()).toBe(status);
  return res;
}
async function restore(kind: string, id: string, status = 204) {
  const res = await t.request(`/api/v1/trash/${kind}/${id}/restore`, { method: 'POST' });
  expect(res.status, await res.clone().text()).toBe(status);
  return res;
}
const trash = () => t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash')).then((r) => r.items);
const person = (firstName: string, lastName = 'Papierkorb', spaceId = t.businessSpace) =>
  post<Person>('/people', { spaceId, firstName, lastName });
const found = async (q: string) =>
  (await t.json<SearchResponse>(t.request(`/api/v1/search?q=${encodeURIComponent(q)}`))).results
    .length > 0;

describe('trash', () => {
  it('a deleted person is not found, after restoring it is again (acceptance)', async () => {
    const p = await person('Rita', 'Rückkehr');
    expect(await found('rückkehr')).toBe(true);
    await del(`/people/${p.id}`);
    expect(await found('rückkehr')).toBe(false);
    expect((await t.request(`/api/v1/people/${p.id}`)).status).toBe(404);

    const [entry] = await trash();
    expect(entry).toMatchObject({
      kind: 'person',
      id: p.id,
      label: { name: 'Rita Rückkehr' },
      spaceId: t.businessSpace,
    });
    expect(Date.parse(entry!.purgeAt) - Date.parse(entry!.deletedAt)).toBe(30 * 86_400_000);

    await restore('person', p.id);
    expect(await found('rückkehr')).toBe(true);
    expect((await t.request(`/api/v1/people/${p.id}`)).status).toBe(200);
    expect(await trash()).toEqual([]);
  });

  it('lists details of a person with their owner and hides them while the owner is trashed', async () => {
    const p = await person('Otto');
    const fact = await post<{ id: string }>(`/people/${p.id}/facts`, { text: 'Spielt Cello' });
    const point = await post<{ id: string }>(`/people/${p.id}/contact-points`, {
      kind: 'email',
      label: 'Arbeit',
      value: 'otto@example.com',
    });
    await del(`/people/${p.id}/facts/${fact.id}`);
    await del(`/people/${p.id}/contact-points/${point.id}`);
    const items = await trash();
    expect(items.map((i) => [i.kind, i.label.name, i.detail])).toEqual(
      expect.arrayContaining([
        ['fact', 'Spielt Cello', null],
        ['contactPoint', 'otto@example.com', 'Arbeit'],
      ]),
    );
    expect(items[0]!.owner).toEqual({ type: 'person', id: p.id, name: 'Otto Papierkorb' });

    // Trashing the person hides its trashed details; they cannot be restored alone.
    await del(`/people/${p.id}`);
    expect((await trash()).map((i) => i.kind)).toEqual(['person']);
    await restore('fact', fact.id, 409);

    await restore('person', p.id);
    await restore('fact', fact.id);
    const back = await t.json<Person>(t.request(`/api/v1/people/${p.id}`));
    expect(back.facts.map((f) => f.text)).toEqual(['Spielt Cello']);
  });

  it('restores entries, follow-ups, organizations and catalog items', async () => {
    const p = await person('Erna');
    const org = await post<Organization>('/organizations', {
      spaceId: t.businessSpace,
      name: 'Werk',
    });
    const call = await post<Entry>('/entries', {
      kind: 'call',
      bodyMd: 'Über den Umzug gesprochen',
      personIds: [p.id],
    });
    const reminder = await post<{ id: string }>(`/people/${p.id}/reminders`, {
      title: 'Zurückrufen',
      dueOn: '2026-10-20',
    });
    const tag = await post<{ id: string }>(`/people/${p.id}/tags`, { name: 'nachbarn' });
    await del(`/entries/${call.id}`);
    await del(`/reminders/${reminder.id}`);
    await del(`/organizations/${org.id}`);
    await del(`/tags/${tag.id}`);

    const items = await trash();
    expect(items.find((i) => i.kind === 'entry')).toMatchObject({
      detail: 'Über den Umzug gesprochen',
      entry: { kind: 'call' },
      owner: { type: 'person', id: p.id },
    });
    expect(items.map((i) => i.kind).sort()).toEqual(['entry', 'organization', 'reminder', 'tag']);

    for (const i of items) await restore(i.kind, i.id);
    expect(await trash()).toEqual([]);
    const back = await t.json<Person>(t.request(`/api/v1/people/${p.id}`));
    expect(back.reminders.map((r) => r.title)).toEqual(['Zurückrufen']);
    expect(back.tags.map((tg) => tg.name)).toEqual(['nachbarn']);
    expect(await found('umzug')).toBe(true);
  });

  it('refuses to restore a tag whose name is taken again', async () => {
    const tag = await post<{ id: string }>('/tags', { name: 'Kunde' });
    await del(`/tags/${tag.id}`);
    await post('/tags', { name: 'kunde' });
    await restore('tag', tag.id, 409);
  });

  it('brings a trashed space back with a person restored into it', async () => {
    const space = await post<{ id: string }>('/spaces', { name: 'Verein' });
    const p = await person('Vera', 'Verein', space.id);
    await del(`/people/${p.id}`);
    await del(`/spaces/${space.id}`);
    await restore('person', p.id);
    const { spaces } = await t.json<{ spaces: { id: string }[] }>(t.request('/api/v1/spaces'));
    expect(spaces.map((s) => s.id)).toContain(space.id);
  });

  it('purges single items, and empties the trash', async () => {
    const keep = await person('Kai');
    const gone = await person('Gina');
    const shared = await post<Entry>('/entries', {
      kind: 'meeting',
      bodyMd: 'Gemeinsames Treffen',
      personIds: [keep.id, gone.id],
    });
    const own = await post<Entry>('/entries', {
      kind: 'note',
      bodyMd: 'Nur Gina',
      personIds: [gone.id],
    });
    await del(`/people/${gone.id}`);
    await del(`/trash/person/${gone.id}`);
    expect(t.db.select().from(people).where(eq(people.id, gone.id)).get()).toBeUndefined();
    // The shared entry stays with Kai; Gina's own note went with her.
    const left = t.db
      .select({ id: entries.id })
      .from(entries)
      .all()
      .map((e) => e.id);
    expect(left).toContain(shared.id);
    expect(left).not.toContain(own.id);
    await del(`/trash/person/${gone.id}`, 404);
    // Live items cannot be purged.
    await del(`/trash/person/${keep.id}`, 404);

    await del(`/people/${keep.id}`);
    const tag = await post<{ id: string }>('/tags', { name: 'weg' });
    await del(`/tags/${tag.id}`);
    const res = await t.json<{ purged: number; kept: number }>(
      t.request('/api/v1/trash', { method: 'DELETE' }),
    );
    expect(res).toEqual({ purged: 2, kept: 0 });
    expect(await trash()).toEqual([]);
    expect(t.db.select().from(entries).all()).toEqual([]);
  });

  it('keeps a relationship type that relationships still use', async () => {
    const a = await person('Anton');
    const b = await person('Berta');
    const type = await post<{ id: string }>('/relationship-types', {
      name: 'Mentor',
      reverseName: 'Mentee',
      symmetric: false,
    });
    await post(`/people/${a.id}/relationships`, { personId: b.id, typeId: type.id });
    await del(`/relationship-types/${type.id}`);
    await del(`/trash/relationshipType/${type.id}`, 409);
    const res = await t.json<{ purged: number; kept: number }>(
      t.request('/api/v1/trash', { method: 'DELETE' }),
    );
    expect(res).toEqual({ purged: 0, kept: 1 });
    expect(
      t.db.select().from(relationshipTypes).where(eq(relationshipTypes.id, type.id)).get(),
    ).toBeDefined();
  });

  it('removes the photo file when a person is purged', async () => {
    const p = await person('Fiona');
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#888' },
    })
      .png()
      .toBuffer();
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'p.png');
    expect((await t.request(`/api/v1/people/${p.id}/photo`, { method: 'PUT', body })).status).toBe(
      200,
    );
    const dir = join(t.dataDir, 'files');
    expect(readdirSync(dir)).toHaveLength(1);
    await del(`/people/${p.id}`);
    expect(readdirSync(dir)).toHaveLength(1);
    await del(`/trash/person/${p.id}`);
    expect(readdirSync(dir)).toHaveLength(0);
    expect(existsSync(dir)).toBe(true);
  });

  it('purges automatically after 30 days', async () => {
    const old = await person('Olga');
    const recent = await person('Rudi');
    await del(`/people/${old.id}`);
    await del(`/people/${recent.id}`);
    t.db
      .update(people)
      .set({ deletedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() })
      .where(eq(people.id, old.id))
      .run();
    expect(await purgeExpired(t.db, t.dataDir)).toEqual({ purged: 1, kept: 0 });
    expect((await trash()).map((i) => i.id)).toEqual([recent.id]);
  });

  it('validates the kind', async () => {
    expect((await t.request('/api/v1/trash/gossip/x/restore', { method: 'POST' })).status).toBe(
      400,
    );
  });
});
