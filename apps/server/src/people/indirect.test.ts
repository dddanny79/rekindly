import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Person,
  PersonListItem,
  Relationship,
  SearchResponse,
  Space,
  TodayResponse,
} from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const post = <T>(path: string, json: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
const patch = <T>(path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'PATCH', json }));
const get = <T>(path: string) => t.json<T>(t.request(`/api/v1${path}`));
const names = (list: { displayName: string }[]) => list.map((p) => p.displayName);

async function janaWithLea() {
  const jana = await post<Person>('/people', {
    spaceId: t.businessSpace,
    firstName: 'Jana',
    lastName: 'Berger',
  });
  // “Lea is child of Jana”: the reverse direction of the parent type.
  const rel = await post<Relationship>(`/people/${jana.id}/relationships`, {
    newPerson: { firstName: 'Lea', lastName: 'Berger' },
    typeId: t.typeId('parent'),
    reverse: true,
  });
  return { jana, lea: await get<Person>(`/people/${rel.person.id}`), rel };
}

describe('indirect contacts', () => {
  it('are created together with a relationship, in the same space (acceptance)', async () => {
    const { jana, lea, rel } = await janaWithLea();
    expect(rel.person.displayName).toBe('Lea Berger');
    expect(lea).toMatchObject({ listed: false, spaceId: jana.spaceId });
    expect(lea.relationships.map((r) => r.person.displayName)).toEqual(['Jana Berger']);
    expect(lea.relatedTo).toMatchObject({
      label: { nameKey: 'seed.relationshipTypes.child' },
      person: { id: jana.id },
    });

    const list = (q = '') => get<{ people: PersonListItem[] }>(`/people${q}`).then((r) => r.people);
    expect(names(await list())).toEqual(['Jana Berger']);
    expect(names(await list('?listed=indirect'))).toEqual(['Lea Berger']);
    expect(names(await list('?listed=all'))).toEqual(['Jana Berger', 'Lea Berger']);

    const { spaces } = await get<{ spaces: Space[] }>('/spaces');
    expect(spaces.find((s) => s.id === t.businessSpace)!.peopleCount).toBe(1);
  });

  it('can also be created as a contact from the relationship form', async () => {
    const jana = await post<Person>('/people', {
      spaceId: t.businessSpace,
      firstName: 'Jana',
      lastName: 'Berger',
    });
    const rel = await post<Relationship>(`/people/${jana.id}/relationships`, {
      newPerson: { firstName: 'Tom', lastName: 'Berger', listed: true },
      typeId: t.typeId('partner'),
    });
    expect((await get<Person>(`/people/${rel.person.id}`)).listed).toBe(true);
  });

  it('validates the relationship request', async () => {
    const jana = await post<Person>('/people', { spaceId: t.businessSpace, firstName: 'Jana' });
    const other = await post<Person>('/people', { spaceId: t.businessSpace, firstName: 'Olaf' });
    const base = `/api/v1/people/${jana.id}/relationships`;
    const req = (json: unknown) => t.request(base, { method: 'POST', json });
    const typeId = t.typeId('friend');
    expect((await req({ typeId })).status).toBe(400);
    expect((await req({ typeId, personId: other.id, newPerson: { firstName: 'X' } })).status).toBe(
      400,
    );
    expect((await req({ typeId, newPerson: { firstName: '  ' } })).status).toBe(400);
  });

  it('are found by search with the person they belong to, after contacts', async () => {
    const { jana } = await janaWithLea();
    await post('/people', { spaceId: t.businessSpace, firstName: 'Lea', lastName: 'Zwicky' });
    const { results } = await get<SearchResponse>('/search?q=lea');
    expect(results.map((r) => (r.type === 'person' ? r.person.displayName : ''))).toEqual([
      'Lea Zwicky',
      'Lea Berger',
    ]);
    expect(results[1]).toMatchObject({
      relatedTo: { label: { nameKey: 'seed.relationshipTypes.child' }, person: { id: jana.id } },
    });
    expect(results[0]).toMatchObject({ relatedTo: null });
  });

  it('show their birthday on Today with the relationship, but no contact rhythm', async () => {
    const { jana, lea } = await janaWithLea();
    await patch(`/people/${lea.id}`, { birthday: '2008-10-20', contactEveryDays: 30 });
    const today = await get<TodayResponse>('/today?date=2026-10-12');
    expect(today.birthdays).toEqual([
      expect.objectContaining({
        person: expect.objectContaining({ displayName: 'Lea Berger' }),
        turns: 18,
        relatedTo: expect.objectContaining({ person: expect.objectContaining({ id: jana.id }) }),
      }),
    ]);
    expect(today.overdueContacts).toEqual([]);
  });

  it('become contacts and back (acceptance)', async () => {
    const { lea } = await janaWithLea();
    expect((await patch<Person>(`/people/${lea.id}`, { listed: true })).listed).toBe(true);
    const { people } = await get<{ people: PersonListItem[] }>('/people');
    expect(names(people)).toEqual(['Jana Berger', 'Lea Berger']);
    const { results } = await get<SearchResponse>('/search?q=lea');
    expect(results[0]).toMatchObject({ relatedTo: null });
    expect((await patch<Person>(`/people/${lea.id}`, { listed: false })).listed).toBe(false);
  });
});
