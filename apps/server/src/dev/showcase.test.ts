import { afterEach, describe, expect, it } from 'vitest';
import type { TodayResponse } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { insertShowcase } from './showcase';

const apps: Awaited<ReturnType<typeof createSignedInApp>>[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

describe('showcase data', () => {
  it('fills an instance with invented people, timeline and a busy Today page', async () => {
    const t = await createSignedInApp();
    apps.push(t);
    insertShowcase(t.db);
    const people = await t.json<{ people: { displayName: string }[] }>(
      t.request('/api/v1/people?listed=all'),
    );
    expect(people.people.map((p) => p.displayName)).toContain('Maya Chen');
    expect(people.people.length).toBeGreaterThanOrEqual(8);
    const today = await t.json<TodayResponse>(t.request('/api/v1/today'));
    expect(today.reminders.length).toBeGreaterThan(0);
    expect(today.birthdays.length).toBeGreaterThan(0);
    expect(today.overdueContacts.length).toBeGreaterThan(0);
  });
});
