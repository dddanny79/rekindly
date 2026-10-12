import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Organization, Person, SearchResponse, SearchResult } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { flushSearchQueue, reindexAll, searchDocumentCount } from './service';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const post = <T>(path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), 201);
const patch = <T>(path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'PATCH', json }));
async function del(path: string) {
  expect((await t.request(`/api/v1${path}`, { method: 'DELETE' })).status).toBe(204);
}

/** Creates a person; `extra` fields are set with a second request. */
async function person(firstName: string, lastName: string, extra: Record<string, unknown> = {}) {
  const created = await post<Person>('/people', { spaceId: t.businessSpace, firstName, lastName });
  return Object.keys(extra).length ? patch<Person>(`/people/${created.id}`, extra) : created;
}
const organization = (name: string, extra: Record<string, unknown> = {}) =>
  post<Organization>('/organizations', { spaceId: t.businessSpace, name, ...extra });

async function search(q: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ q, ...params });
  return t.json<SearchResponse>(t.request(`/api/v1/search?${query}`));
}
const names = (results: SearchResult[]) =>
  results.map((r) => (r.type === 'person' ? r.person.displayName : r.organization.name));

/** "Jana Müller, Einkauf @ Beispiel GmbH › Standort Köln" from the task. */
async function jana() {
  const company = await organization('Beispiel GmbH', { kind: 'company' });
  const site = await organization('Standort Köln', { kind: 'site', parentId: company.id });
  const person = await post<Person>('/people', {
    spaceId: t.businessSpace,
    firstName: 'Jana',
    lastName: 'Müller',
    organizationId: site.id,
    role: 'Einkauf',
  });
  return { company, site, person };
}

describe('search', () => {
  it('finds a person by words spread over name, role and organization (acceptance)', async () => {
    const { person: janaMuller } = await jana();
    await person('Jonas', 'Müller');
    const { results } = await search('mueller köln einkauf');
    expect(names(results)).toEqual(['Jana Müller']);
    const [hit] = results;
    expect(hit).toMatchObject({
      type: 'person',
      id: janaMuller.id,
      subtitle: 'Einkauf @ Standort Köln',
    });
    expect(hit!.matches.map((m) => m.field)).toEqual(['name', 'role', 'organization']);
    const org = hit!.matches.find((m) => m.field === 'organization')!;
    expect(org.text).toBe('Beispiel GmbH › Standort Köln');
    expect(org.highlights.map(([s, e]) => org.text.slice(s, e))).toEqual(['Köln']);
  });

  it('finds a word that only occurs in a call note and shows the excerpt (acceptance)', async () => {
    const tom = await person('Tom', 'Rieger');
    const call = await post<Entry>('/entries', {
      kind: 'call',
      direction: 'in',
      occurredAt: '2026-10-02T09:30:00.000Z',
      bodyMd: `${'Allgemeines zum Projekt. '.repeat(10)}Er erwähnt den **Zebrastreifen** vor dem Büro.`,
      personIds: [tom.id],
    });
    const { results } = await search('zebrastr');
    expect(names(results)).toEqual(['Tom Rieger']);
    const [match] = results[0]!.matches;
    expect(match).toMatchObject({
      field: 'entry',
      entry: { id: call.id, kind: 'call', occurredAt: '2026-10-02T09:30:00.000Z' },
    });
    expect(match!.text.startsWith('…')).toBe(true);
    expect(match!.text).toContain('Zebrastreifen vor dem Büro.');
    expect(match!.highlights.map(([s, e]) => match!.text.slice(s, e))).toEqual(['Zebrastr']);
  });

  it('hides trashed people', async () => {
    const { person } = await jana();
    expect(names((await search('jana')).results)).toEqual(['Jana Müller']);
    await del(`/people/${person.id}`);
    expect((await search('jana')).results).toEqual([]);
  });

  it('ignores case, umlauts, transliterations and accents', async () => {
    await person('Jürgen', 'Weiß', { summary: 'Wohnt in der Hauptstraße' });
    await person('José', 'Núñez');
    for (const q of ['müller', 'Mueller', 'MULLER']) {
      await jana();
      expect(names((await search(q)).results)).toContain('Jana Müller');
    }
    expect(names((await search('juergen weiss')).results)).toEqual(['Jürgen Weiß']);
    expect(names((await search('hauptstrasse')).results)).toEqual(['Jürgen Weiß']);
    expect(names((await search('jose nunez')).results)).toEqual(['José Núñez']);
  });

  it('searches word prefixes from two characters on', async () => {
    await person('Annika', 'Brandt');
    expect(names((await search('an')).results)).toEqual(['Annika Brandt']);
    expect(names((await search('brand an')).results)).toEqual(['Annika Brandt']);
    // One character is not enough, and the middle of a word does not count.
    expect((await search('a')).results).toEqual([]);
    expect((await search('randt')).results).toEqual([]);
    expect((await search('')).results).toEqual([]);
  });

  it('ranks name hits above facts and roles, and those above notes', async () => {
    const byNote = await person('Nora', 'Notiz');
    const byFact = await person('Fritz', 'Fakt');
    await person('Klara', 'Kranich');
    await post('/entries', { kind: 'note', bodyMd: 'Kranich gesehen', personIds: [byNote.id] });
    await post(`/people/${byFact.id}/facts`, { text: 'Sammelt Kranich-Figuren' });
    expect(names((await search('kranich')).results)).toEqual([
      'Klara Kranich',
      'Fritz Fakt',
      'Nora Notiz',
    ]);
  });

  it('indexes contact points, addresses, tags, custom fields and how they met', async () => {
    const p = await person('Paula', 'Punkt', { metWhere: 'Sommerfest Rheinufer' });
    await post(`/people/${p.id}/contact-points`, {
      kind: 'phone',
      label: 'Mobil',
      value: '+49 221 555-0142',
    });
    await post(`/people/${p.id}/contact-points`, { kind: 'email', value: 'paula@example.org' });
    await post(`/people/${p.id}/addresses`, { street: 'Domplatz 1', zip: '50667', city: 'Köln' });
    await post(`/people/${p.id}/tags`, { name: 'segler' });
    const field = await post<{ id: string }>('/field-definitions', {
      target: 'person',
      label: 'Lieblingsgetränk',
      type: 'text',
    });
    await t.json(
      t.request(`/api/v1/people/${p.id}/fields/${field.id}`, {
        method: 'PUT',
        json: { value: 'Grüner Tee' },
      }),
    );

    const fieldOf = async (q: string) => (await search(q)).results[0]?.matches[0];
    expect(await fieldOf('4922155')).toMatchObject({ field: 'contact' });
    expect(await fieldOf('+49 221')).toMatchObject({ field: 'contact', label: 'Mobil' });
    expect(await fieldOf('example.org')).toMatchObject({ field: 'contact' });
    expect(await fieldOf('domplatz')).toMatchObject({ field: 'address' });
    expect(await fieldOf('segler')).toMatchObject({ field: 'tag', text: '#segler' });
    expect(await fieldOf('gruener tee')).toMatchObject({
      field: 'field',
      label: 'Lieblingsgetränk',
    });
    expect(await fieldOf('rheinufer')).toMatchObject({ field: 'met' });
  });

  it('keeps documents current when related records change', async () => {
    const { company, site, person } = await jana();
    // Organization renamed: people below it are found by the new name.
    await patch(`/organizations/${company.id}`, { name: 'Muster AG' });
    expect(names((await search('muster jana')).results)).toEqual(['Jana Müller']);
    expect((await search('beispiel jana')).results).toEqual([]);
    // Organization trashed: its name is gone from the people's path.
    await del(`/organizations/${site.id}`);
    expect((await search('standort jana')).results).toEqual([]);

    // Tag renamed.
    const tag = await post<{ id: string }>(`/people/${person.id}/tags`, { name: 'kunde' });
    await patch(`/tags/${tag.id}`, { name: 'stammkunde' });
    expect(names((await search('stammkunde')).results)).toEqual(['Jana Müller']);

    // Entry edited and trashed.
    const note = await post<Entry>('/entries', {
      kind: 'note',
      bodyMd: 'Mag Kaktus',
      personIds: [person.id],
    });
    expect(names((await search('kaktus')).results)).toEqual(['Jana Müller']);
    await patch(`/entries/${note.id}`, { bodyMd: 'Mag Orchideen' });
    expect((await search('kaktus')).results).toEqual([]);
    expect(names((await search('orchidee')).results)).toEqual(['Jana Müller']);
    await del(`/entries/${note.id}`);
    expect((await search('orchidee')).results).toEqual([]);

    // Fact removed.
    const fact = await post<{ id: string }>(`/people/${person.id}/facts`, { text: 'Tochter Lea' });
    expect(names((await search('lea')).results)).toEqual(['Jana Müller']);
    await del(`/people/${person.id}/facts/${fact.id}`);
    expect((await search('lea')).results).toEqual([]);
  });

  it('finds organizations by name, parent and notes', async () => {
    const { company, site } = await jana();
    await patch(`/organizations/${company.id}`, { notes: 'Rahmenvertrag seit 2024' });
    const { results } = await search('standort', { type: 'organization' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'organization',
      id: site.id,
      organization: { path: [{ name: 'Beispiel GmbH' }, { name: 'Standort Köln' }] },
    });
    expect(names((await search('beispiel köln', { type: 'organization' })).results)).toEqual([
      'Standort Köln',
    ]);
    expect(names((await search('rahmenvertrag')).results)).toEqual(['Beispiel GmbH']);
  });

  it('filters by space, type, tag and organization', async () => {
    const { company, person } = await jana();
    const other = await post<Person>('/people', {
      spaceId: t.privateSpace,
      firstName: 'Jana',
      lastName: 'Privat',
    });
    await post(`/people/${other.id}/tags`, { name: 'familie' });
    const tag = (await t.json<{ tags: { id: string; name: string }[] }>(t.request('/api/v1/tags')))
      .tags[0]!;

    expect(names((await search('jana')).results).sort()).toEqual(['Jana Müller', 'Jana Privat']);
    expect(names((await search('jana', { spaceId: t.privateSpace })).results)).toEqual([
      'Jana Privat',
    ]);
    expect(names((await search('jana', { tagId: tag.id })).results)).toEqual(['Jana Privat']);
    expect(names((await search('jana', { organizationId: company.id })).results)).toEqual([
      'Jana Müller',
    ]);
    expect((await search('beispiel', { type: 'person' })).results.map((r) => r.id)).toEqual([
      person.id,
    ]);
  });

  it('pages with limit and hasMore', async () => {
    for (const n of ['Eins', 'Zwei', 'Drei']) await person('Lima', n);
    const page = await search('lima', { limit: '2' });
    expect(page.results).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect((await search('lima', { limit: '3' })).hasMore).toBe(false);
    expect((await t.request('/api/v1/search?q=lima&limit=0')).status).toBe(400);
    expect((await t.request('/api/v1/search')).status).toBe(400);
  });

  it('rebuilds the whole index', async () => {
    await jana();
    t.db.$client.prepare('delete from search_index').run();
    t.db.$client.prepare('delete from search_documents').run();
    expect((await search('jana')).results).toEqual([]);
    expect(reindexAll(t.db)).toEqual({ people: 1, organizations: 2 });
    expect(names((await search('jana')).results)).toEqual(['Jana Müller']);
    expect(flushSearchQueue(t.db)).toBe(0);
    expect(searchDocumentCount(t.db, 'person')).toBe(1);
  });

  it('needs a session', async () => {
    t.clearCookies();
    expect((await t.request('/api/v1/search?q=jana')).status).toBe(401);
  });
});
