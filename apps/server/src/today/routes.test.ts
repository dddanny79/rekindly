import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Person, TodayResponse } from '@app/shared';
import { people } from '../db/schema';
import { createSignedInApp } from '../test/helpers';
import { nextBirthday } from './service';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const post = <T>(path: string, json: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
const patch = <T>(path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'PATCH', json }));

async function person(firstName: string, extra: Record<string, unknown> = {}, spaceId?: string) {
  const created = await post<Person>('/people', {
    spaceId: spaceId ?? t.businessSpace,
    firstName,
    lastName: 'Heute',
  });
  return Object.keys(extra).length ? patch<Person>(`/people/${created.id}`, extra) : created;
}

const today = (query = 'date=2026-10-12') =>
  t.json<TodayResponse>(t.request(`/api/v1/today?${query}`));
const firstNames = (list: { person: { displayName: string } }[]) =>
  list.map((item) => item.person.displayName.split(' ')[0]);

describe('nextBirthday', () => {
  it('counts days to the next occurrence and the age', () => {
    expect(nextBirthday('1985-10-12', '2026-10-12')).toEqual({
      on: '2026-10-12',
      inDays: 0,
      turns: 41,
    });
    expect(nextBirthday('--10-26', '2026-10-12')).toEqual({
      on: '2026-10-26',
      inDays: 14,
      turns: null,
    });
    expect(nextBirthday('1990-01-03', '2026-12-30')).toEqual({
      on: '2027-01-03',
      inDays: 4,
      turns: 37,
    });
    // 29 February outside leap years: 1 March.
    expect(nextBirthday('2000-02-29', '2027-02-20').on).toBe('2027-03-01');
    expect(nextBirthday('2000-02-29', '2028-02-20').on).toBe('2028-02-29');
  });
});

describe('today', () => {
  it('lists open follow-ups due today or earlier', async () => {
    const p = await person('Fabian');
    await post(`/people/${p.id}/reminders`, { title: 'Überfällig', dueOn: '2026-10-01' });
    await post(`/people/${p.id}/reminders`, { title: 'Heute', dueOn: '2026-10-12' });
    await post(`/people/${p.id}/reminders`, { title: 'Morgen', dueOn: '2026-10-13' });
    const done = await post<{ id: string }>(`/people/${p.id}/reminders`, {
      title: 'Erledigt',
      dueOn: '2026-10-02',
    });
    await patch(`/reminders/${done.id}`, { done: true });
    const { reminders, date } = await today();
    expect(date).toBe('2026-10-12');
    expect(reminders.map((r) => r.title)).toEqual(['Überfällig', 'Heute']);
  });

  it('lists birthdays of the next 14 days, soonest first', async () => {
    await person('Anna', { birthday: '1985-10-12' });
    await person('Bert', { birthday: '--10-26' });
    await person('Carl', { birthday: '1970-10-27' });
    await person('Dora', { birthday: '1990-10-11' });
    const archived = await person('Emil', { birthday: '--10-13' });
    await patch(`/people/${archived.id}`, { archived: true });
    const { birthdays } = await today();
    expect(firstNames(birthdays)).toEqual(['Anna', 'Bert']);
    expect(birthdays[0]).toMatchObject({ on: '2026-10-12', inDays: 0, turns: 41 });
    expect(birthdays[1]).toMatchObject({ on: '2026-10-26', inDays: 14, turns: null });
  });

  it('lists people whose contact rhythm is overdue', async () => {
    const overdue = await person('Olaf', { contactEveryDays: 30 });
    const fresh = await person('Frida', { contactEveryDays: 30 });
    // No contact yet: counts from when the rhythm was set.
    const never = await person('Nina', { contactEveryDays: 90 });
    t.db
      .update(people)
      .set({ contactRhythmSince: '2026-06-01T08:00:00.000Z' })
      .where(eq(people.id, never.id))
      .run();
    await person('Rita', { contactEveryDays: 90 }); // just set: not due yet
    await person('Rolf'); // no rhythm
    const call = (personId: string, occurredAt: string, kind = 'call') =>
      post('/entries', { kind, occurredAt, bodyMd: 'Telefonat', personIds: [personId] });
    await call(overdue.id, '2026-08-01T10:00:00.000Z');
    // A note is no contact.
    await call(overdue.id, '2026-10-10T10:00:00.000Z', 'note');
    await call(fresh.id, '2026-10-01T10:00:00.000Z');
    const { overdueContacts } = await today();
    expect(firstNames(overdueContacts)).toEqual(['Nina', 'Olaf']);
    expect(overdueContacts[0]).toMatchObject({
      person: { id: never.id },
      lastContactAt: null,
      overdueDays: 43,
    });
    expect(overdueContacts[1]).toMatchObject({
      contactEveryDays: 30,
      lastContactAt: '2026-08-01T10:00:00.000Z',
      overdueDays: 42,
    });
  });

  it('remembers since when a contact rhythm applies', async () => {
    const p = await person('Sven');
    expect(p.contactRhythmSince).toBeNull();
    const set = await patch<Person>(`/people/${p.id}`, { contactEveryDays: 30 });
    expect(Date.now() - Date.parse(set.contactRhythmSince!)).toBeLessThan(5000);
    // Changing the interval keeps the date, removing the rhythm clears it.
    expect(
      (await patch<Person>(`/people/${p.id}`, { contactEveryDays: 60 })).contactRhythmSince,
    ).toBe(set.contactRhythmSince);
    expect(
      (await patch<Person>(`/people/${p.id}`, { contactEveryDays: null })).contactRhythmSince,
    ).toBeNull();
  });

  it('lists recently viewed people, newest first, without trashed ones', async () => {
    const a = await person('Ada');
    const b = await person('Ben');
    const c = await person('Cleo');
    for (const p of [a, b, c, a]) {
      expect((await t.request(`/api/v1/people/${p.id}/viewed`, { method: 'POST' })).status).toBe(
        204,
      );
      // Distinct timestamps, even on a fast machine.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await t.request(`/api/v1/people/${b.id}`, { method: 'DELETE' });
    const { recent } = await today();
    expect(firstNames(recent)).toEqual(['Ada', 'Cleo']);
    expect((await t.request('/api/v1/people/missing/viewed', { method: 'POST' })).status).toBe(404);
  });

  it('filters everything by space', async () => {
    const work = await person('Wanda', { birthday: '--10-12', contactEveryDays: 7 });
    const home = await person('Hugo', { birthday: '--10-12', contactEveryDays: 7 }, t.privateSpace);
    for (const p of [work, home]) {
      await post(`/people/${p.id}/reminders`, { title: `Wv ${p.firstName}`, dueOn: '2026-10-01' });
      await t.request(`/api/v1/people/${p.id}/viewed`, { method: 'POST' });
      // Rhythm set long ago, never contacted: overdue.
      t.db
        .update(people)
        .set({ contactRhythmSince: '2026-01-01T08:00:00.000Z' })
        .where(eq(people.id, p.id))
        .run();
    }
    const all = await today();
    expect(all.reminders).toHaveLength(2);
    const privateOnly = await today(`date=2026-10-12&spaceId=${t.privateSpace}`);
    for (const list of [
      privateOnly.birthdays,
      privateOnly.overdueContacts,
      privateOnly.recent,
      privateOnly.reminders,
    ]) {
      expect(firstNames(list as { person: { displayName: string } }[])).toEqual(['Hugo']);
    }
  });

  it('defaults to the current date and validates it', async () => {
    const { date } = await t.json<TodayResponse>(t.request('/api/v1/today'));
    const now = new Date();
    expect(date).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    );
    expect((await t.request('/api/v1/today?date=12.10.2026')).status).toBe(400);
  });
});
