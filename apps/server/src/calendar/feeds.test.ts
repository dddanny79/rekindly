import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateCalendarFeedResponse, Person } from '@app/shared';
import { unfold } from '../dav/vcard';
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

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return local(d);
};

async function feed(
  input: { spaceIds?: string[] | null; includeBirthdays?: boolean; includeDates?: boolean } = {},
) {
  const created = await post<CreateCalendarFeedResponse>('/calendar-feeds', {
    name: 'iPhone',
    spaceIds: input.spaceIds ?? null,
    includeBirthdays: input.includeBirthdays ?? false,
    ...(input.includeDates === undefined ? {} : { includeDates: input.includeDates }),
  });
  const path = new URL(created.url).pathname;
  const res = await t.app.request(path); // no cookie needed
  return { created, res, lines: unfold(await res.text()) };
}

describe('calendar feeds', () => {
  it('lists open follow-ups; overdue ones on today', async () => {
    const jana = await post<Person>('/people', {
      spaceId: t.businessSpace,
      firstName: 'Jana',
      lastName: 'Berger',
    });
    await post(`/people/${jana.id}/reminders`, { title: 'Angebot', dueOn: inDays(5) });
    await post(`/people/${jana.id}/reminders`, { title: 'Rückruf', dueOn: inDays(-3) });
    const done = await post<{ id: string }>(`/people/${jana.id}/reminders`, {
      title: 'Erledigt',
      dueOn: inDays(1),
    });
    await patch(`/reminders/${done.id}`, { done: true });

    const { created, res, lines } = await feed();
    expect(created.url).toMatch(/^http:\/\/localhost:3000\/ics\/[A-Za-z0-9_-]{32}\.ics$/);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain(`DTSTART;VALUE=DATE:${inDays(5).replaceAll('-', '')}`);
    expect(lines).toContain('SUMMARY:Angebot – Jana Berger');
    // Overdue: shown on today with a prefix (account language: German).
    expect(lines).toContain(`DTSTART;VALUE=DATE:${inDays(0).replaceAll('-', '')}`);
    expect(lines).toContain('SUMMARY:Überfällig: Rückruf – Jana Berger');
    expect(lines.join('\n')).not.toContain('Erledigt');
    expect(lines).toContain(`URL;VALUE=URI:http://localhost:3000/people/${jana.id}`);
  });

  it('adds birthdays only when asked, also for indirect contacts', async () => {
    const jana = await post<Person>('/people', {
      spaceId: t.businessSpace,
      firstName: 'Jana',
      lastName: 'Berger',
    });
    await patch(`/people/${jana.id}`, { birthday: '--10-24' });
    const rel = await post<{ person: { id: string } }>(`/people/${jana.id}/relationships`, {
      newPerson: { firstName: 'Lea', lastName: 'Berger' },
      typeId: t.typeId('parent'),
      reverse: true,
    });
    await patch(`/people/${rel.person.id}`, { birthday: '2008-03-08' });

    expect((await feed()).lines.join('\n')).not.toContain('Geburtstag');
    const { lines } = await feed({ includeBirthdays: true });
    expect(lines).toContain('DTSTART;VALUE=DATE:20001024');
    expect(lines).toContain('SUMMARY:Geburtstag: Jana Berger');
    expect(lines).toContain('DTSTART;VALUE=DATE:20080308');
    expect(lines).toContain('SUMMARY:Geburtstag: Lea Berger (über Jana Berger)');
    expect(lines.filter((l) => l === 'RRULE:FREQ=YEARLY')).toHaveLength(2);
  });

  it('adds recurring days only when asked, as yearly events', async () => {
    const jana = await post<Person>('/people', {
      spaceId: t.businessSpace,
      firstName: 'Jana',
      lastName: 'Berger',
    });
    await post(`/people/${jana.id}/dates`, { kind: 'wedding', date: '2015-06-12' });
    await post(`/people/${jana.id}/dates`, { kind: 'custom', label: 'Hauskauf', date: '--09-01' });
    const gone = await post<{ id: string }>(`/people/${jana.id}/dates`, {
      kind: 'nameday',
      date: '--07-26',
    });
    await t.request(`/api/v1/people/${jana.id}/dates/${gone.id}`, { method: 'DELETE' });

    // Older clients leave the option out: no recurring days.
    expect((await feed({ includeBirthdays: true })).lines.join('\n')).not.toContain('Hochzeitstag');
    const { created, lines } = await feed({ includeDates: true });
    expect(created.feed.includeDates).toBe(true);
    expect(lines).toContain('DTSTART;VALUE=DATE:20150612');
    expect(lines).toContain('SUMMARY:Hochzeitstag: Jana Berger');
    expect(lines).toContain('DTSTART;VALUE=DATE:20000901');
    expect(lines).toContain('SUMMARY:Hauskauf: Jana Berger');
    expect(lines.join('\n')).not.toContain('Namenstag');
    expect(lines.filter((l) => l === 'RRULE:FREQ=YEARLY')).toHaveLength(2);
  });

  it('filters by space and is revoked with the feed', async () => {
    const privat = await post<Person>('/people', {
      spaceId: t.privateSpace,
      firstName: 'Paul',
      lastName: 'Privat',
    });
    await post(`/people/${privat.id}/reminders`, { title: 'Privatsache', dueOn: inDays(2) });
    const business = await feed({ spaceIds: [t.businessSpace] });
    expect(business.lines.join('\n')).not.toContain('Privatsache');
    expect((await feed({ spaceIds: [t.privateSpace] })).lines.join('\n')).toContain('Privatsache');

    const { feeds } = await t.json<{ feeds: { id: string; lastUsedAt: string | null }[] }>(
      t.request('/api/v1/calendar-feeds'),
    );
    expect(feeds).toHaveLength(2);
    expect(feeds.every((f) => f.lastUsedAt)).toBe(true);
    await t.request(`/api/v1/calendar-feeds/${business.created.feed.id}`, { method: 'DELETE' });
    expect((await t.app.request(new URL(business.created.url).pathname)).status).toBe(404);
    expect((await t.app.request('/ics/guessing.ics')).status).toBe(404);
  });
});
