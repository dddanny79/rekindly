import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Person, PersonListItem } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

/** Test shorthand: "Jana Maria Berger" → first "Jana Maria", last "Berger". */
const splitName = (name: string) => {
  const words = name.split(' ');
  return words.length > 1
    ? { firstName: words.slice(0, -1).join(' '), lastName: words.at(-1) }
    : { firstName: name };
};

const createPerson = (name: string, extra: Record<string, unknown> = {}) =>
  t.json<Person>(
    t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.businessSpace, ...splitName(name), ...extra },
    }),
    201,
  );
const getPerson = (id: string) => t.json<Person>(t.request(`/api/v1/people/${id}`));
const list = (query = '') =>
  t.json<{ people: PersonListItem[] }>(t.request(`/api/v1/people${query}`)).then((r) => r.people);

describe('people', () => {
  it('quick-creates a person from first and last name', async () => {
    const person = await createPerson('Jana Maria Berger');
    expect(person).toMatchObject({
      firstName: 'Jana Maria',
      lastName: 'Berger',
      displayName: 'Jana Maria Berger',
      initials: 'JB',
      spaceId: t.businessSpace,
      favorite: false,
    });
  });

  it('needs a first or last name', async () => {
    const res = await t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.businessSpace, firstName: ' ', lastName: '' },
    });
    expect(res.status).toBe(400);
    const lastOnly = await t.json<Person>(
      t.request('/api/v1/people', {
        method: 'POST',
        json: { spaceId: t.businessSpace, lastName: 'Berger' },
      }),
      201,
    );
    expect(lastOnly).toMatchObject({ firstName: null, lastName: 'Berger', displayName: 'Berger' });
  });

  it('rejects an unknown space', async () => {
    const res = await t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: 'nope', firstName: 'X' },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_space' });
  });

  it('edits fields inline and validates them', async () => {
    const person = await createPerson('Jana Berger');
    const updated = await t.json<Person>(
      t.request(`/api/v1/people/${person.id}`, {
        method: 'PATCH',
        json: {
          nickname: 'Jani',
          birthday: '--10-24',
          summary: 'Leitet den Einkauf',
          favorite: true,
        },
      }),
    );
    expect(updated).toMatchObject({ nickname: 'Jani', birthday: '--10-24', favorite: true });

    const bad = await t.request(`/api/v1/people/${person.id}`, {
      method: 'PATCH',
      json: { birthday: '24.10.' },
    });
    expect(bad.status).toBe(400);

    const nameless = await t.request(`/api/v1/people/${person.id}`, {
      method: 'PATCH',
      json: { firstName: '', lastName: null, nickname: null },
    });
    expect(await nameless.json()).toEqual({ error: 'name_required' });
  });

  it('moves deleted people to the trash', async () => {
    const person = await createPerson('Jana Berger');
    expect((await t.request(`/api/v1/people/${person.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await t.request(`/api/v1/people/${person.id}`)).status).toBe(404);
    expect(await list()).toHaveLength(0);
    // Still in the database (trash), not hard-deleted.
    const row = t.db.query.people.findFirst().sync();
    expect(row?.deletedAt).toBeTruthy();
  });

  it('keeps contact points, address, tag and custom field on one person (acceptance)', async () => {
    const person = await createPerson('Jana Berger');
    const base = `/api/v1/people/${person.id}`;
    for (const json of [
      { kind: 'phone', label: 'Büro', value: '+49 221 555 01 42', isPrimary: true },
      { kind: 'phone', label: 'Mobil', value: '+49 171 555 88 31' },
      { kind: 'email', value: 'j.berger@example.com' },
    ]) {
      await t.json(t.request(`${base}/contact-points`, { method: 'POST', json }), 201);
    }
    await t.json(
      t.request(`${base}/addresses`, {
        method: 'POST',
        json: {
          label: 'Büro',
          street: 'Musterstraße 1',
          zip: '50667',
          city: 'Köln',
          country: 'DE',
        },
      }),
      201,
    );
    await t.json(t.request(`${base}/tags`, { method: 'POST', json: { name: '#kunde' } }), 201);
    const field = await t.json<{ id: string }>(
      t.request('/api/v1/field-definitions', {
        method: 'POST',
        json: { target: 'person', label: 'Lieblingsgetränk', type: 'text' },
      }),
      201,
    );
    await t.json(
      t.request(`${base}/fields/${field.id}`, { method: 'PUT', json: { value: 'Grüner Tee' } }),
    );

    const full = await getPerson(person.id);
    expect(full.contactPoints.map((c) => [c.kind, c.value, c.isPrimary])).toEqual([
      ['phone', '+49 221 555 01 42', true],
      ['phone', '+49 171 555 88 31', false],
      ['email', 'j.berger@example.com', false],
    ]);
    expect(full.addresses).toEqual([
      expect.objectContaining({ city: 'Köln', street: 'Musterstraße 1' }),
    ]);
    expect(full.tags.map((tag) => tag.name)).toEqual(['kunde']);
    expect(full.fields).toEqual([{ definitionId: field.id, value: 'Grüner Tee' }]);
  });

  it('keeps one primary contact point per kind and soft-deletes', async () => {
    const person = await createPerson('Jana Berger');
    const base = `/api/v1/people/${person.id}/contact-points`;
    const a = await t.json<{ id: string }>(
      t.request(base, { method: 'POST', json: { kind: 'phone', value: '1', isPrimary: true } }),
      201,
    );
    const b = await t.json<{ id: string }>(
      t.request(base, { method: 'POST', json: { kind: 'phone', value: '2', isPrimary: true } }),
      201,
    );
    let full = await getPerson(person.id);
    expect(full.contactPoints.find((c) => c.id === a.id)?.isPrimary).toBe(false);
    expect(full.contactPoints.find((c) => c.id === b.id)?.isPrimary).toBe(true);

    expect((await t.request(`${base}/${a.id}`, { method: 'DELETE' })).status).toBe(204);
    full = await getPerson(person.id);
    expect(full.contactPoints.map((c) => c.id)).toEqual([b.id]);
    expect((await t.request(`${base}/${a.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('rejects invalid custom field values', async () => {
    const person = await createPerson('Jana Berger');
    const field = await t.json<{ id: string }>(
      t.request('/api/v1/field-definitions', {
        method: 'POST',
        json: { target: 'person', label: 'Stärke', type: 'number' },
      }),
      201,
    );
    const res = await t.request(`/api/v1/people/${person.id}/fields/${field.id}`, {
      method: 'PUT',
      json: { value: 'viel' },
    });
    expect(await res.json()).toEqual({ error: 'invalid_field_value' });
    // Empty clears the value.
    await t.json(
      t.request(`/api/v1/people/${person.id}/fields/${field.id}`, {
        method: 'PUT',
        json: { value: '3' },
      }),
    );
    const cleared = await t.request(`/api/v1/people/${person.id}/fields/${field.id}`, {
      method: 'PUT',
      json: { value: '' },
    });
    expect(cleared.status).toBe(204);
    expect((await getPerson(person.id)).fields).toEqual([]);
  });

  it('shows a relationship in both directions with the reverse label (acceptance)', async () => {
    const a = await createPerson('Anna Albers');
    const b = await createPerson('Bernd Albers');
    // On A's page: B is A's parent.
    const rel = await t.json<{ label: { nameKey: string } }>(
      t.request(`/api/v1/people/${a.id}/relationships`, {
        method: 'POST',
        json: { personId: b.id, typeId: t.typeId('parent') },
      }),
      201,
    );
    expect(rel.label.nameKey).toBe('seed.relationshipTypes.parent');

    const fromB = (await getPerson(b.id)).relationships;
    expect(fromB).toHaveLength(1);
    expect(fromB[0]!.label.nameKey).toBe('seed.relationshipTypes.child');
    expect(fromB[0]!.person.id).toBe(a.id);

    // Deleting from B's side removes it for both.
    await t.request(`/api/v1/people/${b.id}/relationships/${fromB[0]!.id}`, { method: 'DELETE' });
    expect((await getPerson(a.id)).relationships).toEqual([]);
  });

  it('adds the reverse direction from the same type', async () => {
    const parent = await createPerson('Bernd Albers');
    const child = await createPerson('Anna Albers');
    // On the parent's page: Anna is Bernd's child (reverse of “parent”).
    await t.json(
      t.request(`/api/v1/people/${parent.id}/relationships`, {
        method: 'POST',
        json: { personId: child.id, typeId: t.typeId('parent'), reverse: true },
      }),
      201,
    );
    expect((await getPerson(parent.id)).relationships[0]!.label.nameKey).toBe(
      'seed.relationshipTypes.child',
    );
    expect((await getPerson(child.id)).relationships[0]!.label.nameKey).toBe(
      'seed.relationshipTypes.parent',
    );
  });

  it('rejects relationships to oneself or unknown people', async () => {
    const a = await createPerson('Anna Albers');
    for (const personId of [a.id, 'nope']) {
      const res = await t.request(`/api/v1/people/${a.id}/relationships`, {
        method: 'POST',
        json: { personId, typeId: t.typeId('friend') },
      });
      expect(res.status).toBe(400);
    }
  });

  it('filters by space, name (umlaut-insensitive), tag, favorite and archive', async () => {
    const mueller = await createPerson('Jürgen Müller');
    await createPerson('Clara Weidemann', { spaceId: t.privateSpace });
    const archived = await createPerson('Rüdiger Plöger');
    await t.request(`/api/v1/people/${archived.id}`, { method: 'PATCH', json: { archived: true } });
    await t.request(`/api/v1/people/${mueller.id}/tags`, {
      method: 'POST',
      json: { name: 'Köln' },
    });
    await t.request(`/api/v1/people/${mueller.id}`, { method: 'PATCH', json: { favorite: true } });

    const names = (people: PersonListItem[]) => people.map((p) => p.displayName);
    expect(names(await list())).toEqual(['Jürgen Müller', 'Clara Weidemann']);
    expect(names(await list(`?spaceId=${t.privateSpace}`))).toEqual(['Clara Weidemann']);
    for (const q of ['Mueller', 'muller', 'MÜLL', 'jurgen']) {
      expect(names(await list(`?q=${encodeURIComponent(q)}`)), q).toEqual(['Jürgen Müller']);
    }
    expect(names(await list('?q=%25'))).toEqual([]);
    const tagId = (await getPerson(mueller.id)).tags[0]!.id;
    expect(names(await list(`?tagId=${tagId}`))).toEqual(['Jürgen Müller']);
    expect(names(await list('?favorite=true'))).toEqual(['Jürgen Müller']);
    expect(names(await list('?archived=true'))).toEqual(['Rüdiger Plöger']);
  });

  it('sorts by name and by recent change', async () => {
    await createPerson('Zoe Adler');
    const b = await createPerson('Anna Zander');
    expect((await list()).map((p) => p.displayName)).toEqual(['Zoe Adler', 'Anna Zander']);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.request(`/api/v1/people/${b.id}`, { method: 'PATCH', json: { summary: 'neu' } });
    expect((await list('?sort=updated')).map((p) => p.displayName)).toEqual([
      'Anna Zander',
      'Zoe Adler',
    ]);
  });
});

describe('photos', () => {
  it('scales to 512 px, strips EXIF and serves the file', async () => {
    const person = await createPerson('Jana Berger');
    const input = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: '#a33' },
    })
      .withExif({ IFD0: { Copyright: 'secret', Artist: 'Someone' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const form = new FormData();
    form.append('file', new File([new Uint8Array(input)], 'photo.jpg', { type: 'image/jpeg' }));
    const updated = await t.json<Person>(
      t.request(`/api/v1/people/${person.id}/photo`, { method: 'PUT', body: form }),
    );
    expect(updated.photoUrl).toMatch(/^\/api\/v1\/files\//);

    const res = await t.request(updated.photoUrl!);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
    expect(meta.exif).toBeUndefined();

    // Files need a session.
    t.clearCookies();
    expect((await t.request(updated.photoUrl!)).status).toBe(401);
  });

  it('rejects non-images and removes photos', async () => {
    const person = await createPerson('Jana Berger');
    const form = new FormData();
    form.append('file', new File(['not an image'], 'x.jpg', { type: 'image/jpeg' }));
    const res = await t.request(`/api/v1/people/${person.id}/photo`, { method: 'PUT', body: form });
    expect(await res.json()).toEqual({ error: 'invalid_image' });

    const removed = await t.json<Person>(
      t.request(`/api/v1/people/${person.id}/photo`, { method: 'DELETE' }),
    );
    expect(removed.photoUrl).toBeNull();
  });
});
