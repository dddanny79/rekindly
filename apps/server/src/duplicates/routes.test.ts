import { afterEach, describe, expect, it } from 'vitest';
import type { DuplicatePair, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

const post = <T>(t: App, path: string, json: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);

async function person(t: App, firstName: string, lastName: string, extra: object = {}) {
  const p = await post<Person>(t, '/people', { spaceId: t.privateSpace, firstName, lastName });
  if (Object.keys(extra).length) {
    await t.json(t.request(`/api/v1/people/${p.id}`, { method: 'PATCH', json: extra }));
  }
  return p;
}
const point = (t: App, id: string, kind: string, value: string) =>
  post(t, `/people/${id}/contact-points`, { kind, value });

const duplicates = (t: App) =>
  t.json<{ pairs: DuplicatePair[] }>(t.request('/api/v1/duplicates')).then((r) => r.pairs);

describe('duplicates', () => {
  it('finds pairs by email, phone and name; a dismissed pair stays away', async () => {
    const t = await app();
    const jana = await person(t, 'Jana', 'Müller');
    const jana2 = await person(t, 'Jana', 'Mueller');
    const tom = await person(t, 'Tom', 'Weber');
    const thomas = await person(t, 'Thomas', 'Weber');
    await point(t, jana.id, 'email', 'jana@example.com');
    await point(t, jana2.id, 'email', 'Jana@Example.com');
    await point(t, tom.id, 'phone', '+49 171 2345678');
    await point(t, thomas.id, 'phone', '0171 2345678');
    await person(t, 'Lena', 'Beispiel');

    const pairs = await duplicates(t);
    expect(pairs.map((p) => [p.a.displayName, p.b.displayName].sort().concat(p.reasons))).toEqual([
      ['Jana Mueller', 'Jana Müller', 'email', 'name'],
      ['Thomas Weber', 'Tom Weber', 'phone'],
    ]);
    expect(pairs[0]!.a.details).toMatch(/example\.com/i);

    const res = await t.request('/api/v1/duplicates/dismiss', {
      method: 'POST',
      json: { personIds: [thomas.id, tom.id] },
    });
    expect(res.status).toBe(204);
    expect((await duplicates(t)).map((p) => p.reasons)).toEqual([['email', 'name']]);
  });

  it('merges without losing entries, details, facts, relationships, tags or fields', async () => {
    const t = await app();
    const keep = await person(t, 'Jana', 'Müller', { summary: 'Kundin' });
    const other = await person(t, 'Jana', 'Mueller', {
      birthday: '1990-05-01',
      summary: 'Einkauf',
    });
    const tom = await person(t, 'Tom', 'Weber');
    const lena = await person(t, 'Lena', 'Beispiel', { metThroughPersonId: other.id });
    await point(t, keep.id, 'phone', '+49 171 1234567');
    await point(t, other.id, 'phone', '0171 1234567');
    await point(t, other.id, 'email', 'jana@example.com');
    await post(t, `/people/${other.id}/addresses`, { street: 'Domplatz 1', city: 'Köln' });
    await post(t, `/people/${keep.id}/tags`, { name: 'Kunde' });
    await post(t, `/people/${other.id}/tags`, { name: 'Messe' });
    await post(t, `/people/${keep.id}/facts`, { text: 'Trinkt Tee' });
    await post(t, `/people/${other.id}/facts`, { text: 'Trinkt Tee' });
    await post(t, `/people/${other.id}/facts`, { text: 'Hat zwei Kinder' });
    await post(t, `/people/${other.id}/questions`, { text: 'Wie geht es den Kindern?' });
    await post(t, `/people/${keep.id}/dates`, { kind: 'wedding', date: '2015-06-12' });
    await post(t, `/people/${other.id}/dates`, { kind: 'wedding', date: '2015-06-12' });
    await post(t, `/people/${other.id}/dates`, { kind: 'nameday', date: '--07-26' });
    await post(t, `/people/${other.id}/reminders`, {
      title: 'Angebot schicken',
      dueOn: '2030-01-01',
    });
    await post(t, '/entries', { kind: 'note', bodyMd: 'Nur bei Jana', personIds: [keep.id] });
    await post(t, '/entries', {
      kind: 'call',
      bodyMd: 'Bei beiden',
      personIds: [keep.id, other.id],
    });
    await post(t, '/entries', {
      kind: 'meeting',
      bodyMd: 'Nur beim Duplikat',
      personIds: [other.id, tom.id],
    });
    await post(t, `/people/${keep.id}/relationships`, {
      personId: tom.id,
      typeId: t.typeId('friend'),
    });
    await post(t, `/people/${other.id}/relationships`, {
      personId: tom.id,
      typeId: t.typeId('friend'),
    });
    await post(t, `/people/${other.id}/relationships`, {
      personId: keep.id,
      typeId: t.typeId('sibling'),
    });
    await post(t, `/people/${other.id}/relationships`, {
      personId: lena.id,
      typeId: t.typeId('colleague'),
    });
    const field = await post<{ id: string }>(t, '/field-definitions', {
      target: 'person',
      label: 'Lieblingsgetränk',
      type: 'text',
    });
    await t.json(
      t.request(`/api/v1/people/${other.id}/fields/${field.id}`, {
        method: 'PUT',
        json: { value: 'Mate' },
      }),
    );

    const merged = await post<Person>(
      t,
      '/duplicates/merge',
      { keepId: keep.id, mergeId: other.id, take: ['summary'] },
      200,
    );
    expect(merged).toMatchObject({
      id: keep.id,
      displayName: 'Jana Müller',
      birthday: '1990-05-01',
      summary: 'Einkauf',
    });
    expect(merged.contactPoints.map((p) => p.value)).toEqual([
      '+49 171 1234567',
      'jana@example.com',
    ]);
    expect(merged.addresses.map((a) => a.street)).toEqual(['Domplatz 1']);
    expect(merged.tags.map((tag) => tag.name).sort()).toEqual(['Kunde', 'Messe']);
    expect(merged.facts.map((f) => f.text)).toEqual(['Trinkt Tee', 'Hat zwei Kinder']);
    expect(merged.questions.map((q) => q.text)).toEqual(['Wie geht es den Kindern?']);
    expect(merged.dates.map((d) => d.kind)).toEqual(['wedding', 'nameday']);
    expect(merged.reminders.map((r) => r.title)).toEqual(['Angebot schicken']);
    expect(merged.fields.find((f) => f.definitionId === field.id)?.value).toBe('Mate');
    expect(merged.relationships.map((r) => r.person.displayName).sort()).toEqual([
      'Lena Beispiel',
      'Tom Weber',
    ]);

    const timeline = await t.json<{
      entries: { bodyMd: string; source?: string; people: { id: string }[] }[];
    }>(t.request(`/api/v1/entries?personId=${keep.id}`));
    const bodies = timeline.entries.map((e) => e.bodyMd);
    expect(bodies).toEqual(
      expect.arrayContaining(['Nur bei Jana', 'Bei beiden', 'Nur beim Duplikat']),
    );
    const both = timeline.entries.find((e) => e.bodyMd === 'Bei beiden')!;
    expect(both.people.map((p) => p.id)).toEqual([keep.id]);

    expect((await t.json<Person>(t.request(`/api/v1/people/${lena.id}`))).metThrough?.id).toBe(
      keep.id,
    );
    // The merged person is in the trash; no pair is left.
    expect((await t.request(`/api/v1/people/${other.id}`)).status).toBe(404);
    expect(await duplicates(t)).toEqual([]);
  });

  it('takes the name and other values when chosen, fills empty ones', async () => {
    const t = await app();
    const keep = await person(t, 'Jani', 'Müller', { nickname: 'J' });
    const other = await person(t, 'Jana', 'Müller', { nickname: 'Jaja', pronouns: 'sie/ihr' });
    const merged = await post<Person>(
      t,
      '/duplicates/merge',
      { keepId: keep.id, mergeId: other.id, take: ['name'] },
      200,
    );
    expect(merged).toMatchObject({ firstName: 'Jana', nickname: 'J', pronouns: 'sie/ihr' });
  });

  it('refuses merging a person with itself or with someone in the trash', async () => {
    const t = await app();
    const a = await person(t, 'Jana', 'Müller');
    const b = await person(t, 'Jana', 'Mueller');
    expect(
      (
        await t.request('/api/v1/duplicates/merge', {
          method: 'POST',
          json: { keepId: a.id, mergeId: a.id },
        })
      ).status,
    ).toBe(400);
    await t.request(`/api/v1/people/${b.id}`, { method: 'DELETE' });
    expect(
      (
        await t.request('/api/v1/duplicates/merge', {
          method: 'POST',
          json: { keepId: a.id, mergeId: b.id },
        })
      ).status,
    ).toBe(404);
  });
});
