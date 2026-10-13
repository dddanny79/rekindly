import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Person, Question, SearchResponse, TrashItem } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const person = (firstName: string, lastName: string) =>
  t.json<Person>(
    t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.businessSpace, firstName, lastName },
    }),
    201,
  );
const getPerson = (id: string) => t.json<Person>(t.request(`/api/v1/people/${id}`));
const add = (personId: string, text: string) =>
  t.json<Question>(
    t.request(`/api/v1/people/${personId}/questions`, { method: 'POST', json: { text } }),
    201,
  );
const timeline = (personId: string) =>
  t
    .json<{ entries: Entry[] }>(t.request(`/api/v1/entries?personId=${personId}`))
    .then((r) => r.entries);

describe('questions for next time', () => {
  it('adds, changes, reorders and moves questions to the trash', async () => {
    const jana = await person('Jana', 'Berger');
    const base = `/api/v1/people/${jana.id}/questions`;
    const a = await add(jana.id, 'Wie lief der Marathon?');
    const b = await add(jana.id, 'Hat Luca die Stelle angetreten?');
    expect((await getPerson(jana.id)).questions.map((q) => q.text)).toEqual([
      'Wie lief der Marathon?',
      'Hat Luca die Stelle angetreten?',
    ]);

    const changed = await t.json<Question>(
      t.request(`${base}/${a.id}`, {
        method: 'PATCH',
        json: { text: 'Wie lief der Halbmarathon?' },
      }),
    );
    expect(changed.text).toBe('Wie lief der Halbmarathon?');
    const { questions } = await t.json<{ questions: Question[] }>(
      t.request(`${base}/order`, { method: 'PUT', json: { ids: [b.id, a.id] } }),
    );
    expect(questions.map((q) => q.id)).toEqual([b.id, a.id]);

    expect((await t.request(`${base}/${b.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await getPerson(jana.id)).questions.map((q) => q.id)).toEqual([a.id]);
    const trash = await t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash'));
    expect(trash.items.map((i) => [i.kind, i.id])).toEqual([['question', b.id]]);
    const restored = await t.request(`/api/v1/trash/question/${b.id}/restore`, { method: 'POST' });
    expect(restored.status).toBe(204);
    expect((await getPerson(jana.id)).questions).toHaveLength(2);
  });

  it('rejects empty questions and unknown people', async () => {
    const jana = await person('Jana', 'Berger');
    const res = await t.request(`/api/v1/people/${jana.id}/questions`, {
      method: 'POST',
      json: { text: '   ' },
    });
    expect(res.status).toBe(400);
    const missing = await t.request('/api/v1/people/nope/questions', {
      method: 'POST',
      json: { text: 'Hallo?' },
    });
    expect(missing.status).toBe(404);
  });

  it('asked without an answer only removes the question (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const q = await add(jana.id, 'Wie lief der Umzug?');
    const res = await t.json<{ entry: Entry | null }>(
      t.request(`/api/v1/people/${jana.id}/questions/${q.id}/asked`, { method: 'POST', json: {} }),
    );
    expect(res.entry).toBeNull();
    expect((await getPerson(jana.id)).questions).toEqual([]);
    expect(await timeline(jana.id)).toEqual([]);
    // Asked is final: it can be neither asked again nor changed.
    const again = await t.request(`/api/v1/people/${jana.id}/questions/${q.id}/asked`, {
      method: 'POST',
      json: {},
    });
    expect(again.status).toBe(404);
  });

  it('asked with an answer adds a note to the timeline (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const q = await add(jana.id, 'Wie lief der Umzug?');
    const { entry } = await t.json<{ entry: Entry | null }>(
      t.request(`/api/v1/people/${jana.id}/questions/${q.id}/asked`, {
        method: 'POST',
        json: { answer: 'Gut, nur der Keller ist noch voll.' },
      }),
    );
    expect(entry).toMatchObject({
      kind: 'note',
      title: 'Wie lief der Umzug?',
      bodyMd: 'Gut, nur der Keller ist noch voll.',
    });
    expect((await timeline(jana.id)).map((e) => e.id)).toEqual([entry!.id]);
    expect((await getPerson(jana.id)).questions).toEqual([]);
  });

  it('open questions are searchable, asked ones are not', async () => {
    const jana = await person('Jana', 'Berger');
    const q = await add(jana.id, 'Wie war die Reise nach Lissabon?');
    const search = (q: string) =>
      t.json<SearchResponse>(t.request(`/api/v1/search?q=${encodeURIComponent(q)}`));
    const { results } = await search('lissabon');
    expect(results.map((r) => r.id)).toEqual([jana.id]);
    expect(results[0]!.matches.map((m) => m.field)).toEqual(['question']);

    await t.request(`/api/v1/people/${jana.id}/questions/${q.id}/asked`, {
      method: 'POST',
      json: {},
    });
    expect((await search('lissabon')).results).toEqual([]);
  });

  it('ignores ids of other people when reordering', async () => {
    const jana = await person('Jana', 'Berger');
    const otto = await person('Otto', 'Außen');
    const foreign = await add(otto.id, 'fremd');
    await t.request(`/api/v1/people/${jana.id}/questions/order`, {
      method: 'PUT',
      json: { ids: [foreign.id] },
    });
    expect((await getPerson(otto.id)).questions[0]!.sort).toBe(0);
  });
});
