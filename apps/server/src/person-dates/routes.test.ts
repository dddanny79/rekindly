import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Person, PersonDate, TodayResponse, TrashItem } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const person = (firstName: string, lastName: string, spaceId = t.businessSpace) =>
  t.json<Person>(
    t.request('/api/v1/people', { method: 'POST', json: { spaceId, firstName, lastName } }),
    201,
  );
const getPerson = (id: string) => t.json<Person>(t.request(`/api/v1/people/${id}`));
const add = (personId: string, json: Record<string, unknown>) =>
  t.json<PersonDate>(t.request(`/api/v1/people/${personId}/dates`, { method: 'POST', json }), 201);
const today = (date: string) => t.json<TodayResponse>(t.request(`/api/v1/today?date=${date}`));

describe('recurring days', () => {
  it('adds, changes and moves days to the trash, in calendar order (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const wedding = await add(jana.id, { kind: 'wedding', date: '2015-06-12' });
    await add(jana.id, { kind: 'custom', label: 'Hauskauf', date: '--02-01' });
    // Only custom days keep an own label.
    const met = await add(jana.id, { kind: 'met', label: 'ignored', date: '2009-09-30' });
    expect(met.label).toBeNull();
    expect((await getPerson(jana.id)).dates.map((d) => [d.kind, d.label, d.date])).toEqual([
      ['custom', 'Hauskauf', '--02-01'],
      ['wedding', null, '2015-06-12'],
      ['met', null, '2009-09-30'],
    ]);

    const base = `/api/v1/people/${jana.id}/dates`;
    const changed = await t.json<PersonDate>(
      t.request(`${base}/${wedding.id}`, { method: 'PATCH', json: { date: '2015-06-13' } }),
    );
    expect(changed.date).toBe('2015-06-13');
    const toCustom = await t.request(`${base}/${wedding.id}`, {
      method: 'PATCH',
      json: { kind: 'custom' },
    });
    expect(toCustom.status).toBe(400);

    expect((await t.request(`${base}/${met.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await getPerson(jana.id)).dates).toHaveLength(2);
    const trash = await t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash'));
    expect(trash.items).toEqual([
      expect.objectContaining({
        kind: 'personDate',
        id: met.id,
        label: { name: null, nameKey: 'personDates.kinds.met' },
        detail: '2009-09-30',
      }),
    ]);
    await t.request(`/api/v1/trash/personDate/${met.id}/restore`, { method: 'POST' });
    expect((await getPerson(jana.id)).dates).toHaveLength(3);
  });

  it('validates kind, date and the label of custom days', async () => {
    const jana = await person('Jana', 'Berger');
    const bad = (json: unknown) =>
      t.request(`/api/v1/people/${jana.id}/dates`, { method: 'POST', json });
    expect((await bad({ kind: 'custom', date: '--02-01' })).status).toBe(400);
    expect((await bad({ kind: 'wedding', date: '2015-13-01' })).status).toBe(400);
    expect((await bad({ kind: 'party', date: '2015-01-01' })).status).toBe(400);
    const missing = await t.request('/api/v1/people/nope/dates', {
      method: 'POST',
      json: { kind: 'wedding', date: '2015-01-01' },
    });
    expect(missing.status).toBe(404);
  });

  it('Today lists the days of the next 14 days with years (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const opa = await person('Otto', 'Berger', t.privateSpace);
    await add(jana.id, { kind: 'wedding', date: '2016-03-12' });
    await add(jana.id, { kind: 'nameday', date: '1990-03-09' });
    await add(opa.id, { kind: 'memorial', date: '2020-03-10' });
    await add(jana.id, { kind: 'met', date: '2009-04-30' });

    const { dates } = await today('2030-03-08');
    expect(dates.map((d) => [d.person.displayName, d.kind, d.on, d.inDays, d.years])).toEqual([
      ['Jana Berger', 'nameday', '2030-03-09', 1, null],
      ['Otto Berger', 'memorial', '2030-03-10', 2, 10],
      ['Jana Berger', 'wedding', '2030-03-12', 4, 14],
    ]);
    const business = await t.json<TodayResponse>(
      t.request(`/api/v1/today?date=2030-03-08&spaceId=${t.businessSpace}`),
    );
    expect(business.dates.map((d) => d.kind)).toEqual(['nameday', 'wedding']);
  });
});
