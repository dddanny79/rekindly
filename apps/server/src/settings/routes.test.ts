import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  InstanceSettings,
  Person,
  PersonListItem,
  SearchResponse,
  TodayResponse,
} from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const settings = () => t.json<InstanceSettings>(t.request('/api/v1/settings'));
const update = (json: Partial<InstanceSettings>) =>
  t.json<InstanceSettings>(t.request('/api/v1/settings', { method: 'PATCH', json }));
const createPerson = (json: Record<string, unknown>) =>
  t.json<Person>(
    t.request('/api/v1/people', { method: 'POST', json: { spaceId: t.businessSpace, ...json } }),
    201,
  );
const listNames = () =>
  t
    .json<{ people: PersonListItem[] }>(t.request('/api/v1/people'))
    .then((r) => r.people.map((p) => p.displayName));

describe('name settings', () => {
  it('default to "Jana Berger", sorted by last name', async () => {
    expect(await settings()).toMatchObject({
      nameDisplayOrder: 'firstLast',
      nameSortOrder: 'lastName',
    });
    await createPerson({ firstName: 'Jana', lastName: 'Berger' });
    await createPerson({ firstName: 'Anton', lastName: 'Zeller' });
    expect(await listNames()).toEqual(['Jana Berger', 'Anton Zeller']);
  });

  it('write the last name first and sort by first name everywhere', async () => {
    const jana = await createPerson({ firstName: 'Jana', lastName: 'Berger' });
    await t.request(`/api/v1/people/${jana.id}`, {
      method: 'PATCH',
      json: { prefix: 'Dr.', nickname: 'Jani', birthday: '1985-10-12' },
    });
    const anton = await createPerson({ firstName: 'Anton', lastName: 'Zeller' });
    await createPerson({ lastName: 'Bergmann' });
    await t.request(`/api/v1/people/${anton.id}/relationships`, {
      method: 'POST',
      json: { personId: jana.id, typeId: t.typeId('parent') },
    });

    expect(await update({ nameDisplayOrder: 'lastFirst', nameSortOrder: 'firstName' })).toEqual({
      passkeysEnabled: false,
      nameDisplayOrder: 'lastFirst',
      nameSortOrder: 'firstName',
    });

    // List: first-name order, one-part names unchanged.
    expect(await listNames()).toEqual(['Zeller, Anton', 'Bergmann', 'Berger, Dr. Jana (Jani)']);

    // Detail and the people it links to.
    const detail = await t.json<Person>(t.request(`/api/v1/people/${anton.id}`));
    expect(detail.displayName).toBe('Zeller, Anton');
    expect(detail.relationships[0]!.person.displayName).toBe('Berger, Dr. Jana (Jani)');
    // The stored name parts stay as they are.
    expect(detail).toMatchObject({ firstName: 'Anton', lastName: 'Zeller' });

    // Search and Today use the same refs.
    const found = await t.json<SearchResponse>(t.request('/api/v1/search?q=berger'));
    expect(found.results[0]).toMatchObject({ person: { displayName: 'Berger, Dr. Jana (Jani)' } });
    const today = await t.json<TodayResponse>(t.request('/api/v1/today?date=2026-10-12'));
    expect(today.birthdays.map((b) => b.person.displayName)).toEqual(['Berger, Dr. Jana (Jani)']);
  });

  it('keep each value until it is changed', async () => {
    await update({ nameSortOrder: 'firstName' });
    expect(await settings()).toMatchObject({
      nameDisplayOrder: 'firstLast',
      nameSortOrder: 'firstName',
    });
  });

  it('reject unknown values', async () => {
    for (const json of [{ nameDisplayOrder: 'lastOnly' }, { nameSortOrder: 'nickname' }]) {
      const res = await t.request('/api/v1/settings', { method: 'PATCH', json });
      expect(res.status).toBe(400);
    }
  });
});
