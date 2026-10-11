import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FieldDefinition, RelationshipType, Space, Tag } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

describe('spaces', () => {
  it('lists the seeded spaces with people counts', async () => {
    await t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.privateSpace, firstName: 'A', lastName: 'B' },
    });
    const { spaces } = await t.json<{ spaces: Space[] }>(t.request('/api/v1/spaces'));
    expect(spaces.map((s) => [s.nameKey, s.color, s.peopleCount])).toEqual([
      ['seed.spaces.private', 'olive', 1],
      ['seed.spaces.business', 'navy', 0],
    ]);
  });

  it('creates, renames and deletes only empty spaces', async () => {
    const created = await t.json<Space>(
      t.request('/api/v1/spaces', { method: 'POST', json: { name: 'Verein', color: 'teal' } }),
      201,
    );
    const renamed = await t.json<Space>(
      t.request(`/api/v1/spaces/${t.privateSpace}`, { method: 'PATCH', json: { name: 'Familie' } }),
    );
    expect(renamed).toMatchObject({ name: 'Familie', nameKey: null });

    await t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: created.id, firstName: 'A', lastName: 'B' },
    });
    const busy = await t.request(`/api/v1/spaces/${created.id}`, { method: 'DELETE' });
    expect(await busy.json()).toEqual({ error: 'space_not_empty' });
    expect(
      (await t.request(`/api/v1/spaces/${t.businessSpace}`, { method: 'DELETE' })).status,
    ).toBe(204);
  });

  it('never deletes the last space', async () => {
    await t.request(`/api/v1/spaces/${t.businessSpace}`, { method: 'DELETE' });
    const res = await t.request(`/api/v1/spaces/${t.privateSpace}`, { method: 'DELETE' });
    expect(await res.json()).toEqual({ error: 'last_space' });
  });
});

describe('tags', () => {
  it('creates, renames, refuses duplicates and soft-deletes', async () => {
    const tag = await t.json<Tag>(
      t.request('/api/v1/tags', { method: 'POST', json: { name: '#Kunde' } }),
      201,
    );
    expect(tag.name).toBe('Kunde');
    const dup = await t.request('/api/v1/tags', { method: 'POST', json: { name: 'kunde' } });
    expect(dup.status).toBe(409);
    await t.json(
      t.request(`/api/v1/tags/${tag.id}`, { method: 'PATCH', json: { name: 'Kundin' } }),
    );
    expect((await t.request(`/api/v1/tags/${tag.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await t.json<{ tags: Tag[] }>(t.request('/api/v1/tags'))).tags).toEqual([]);
    // The name is free again after deleting.
    await t.json(t.request('/api/v1/tags', { method: 'POST', json: { name: 'Kundin' } }), 201);
  });
});

describe('relationship types', () => {
  it('lists the seeded defaults', async () => {
    const { relationshipTypes } = await t.json<{ relationshipTypes: RelationshipType[] }>(
      t.request('/api/v1/relationship-types'),
    );
    expect(relationshipTypes.map((r) => r.nameKey?.replace('seed.relationshipTypes.', ''))).toEqual(
      ['partner', 'parent', 'sibling', 'friend', 'colleague', 'manager'],
    );
  });

  it('creates symmetric and directed types and renames seeded ones', async () => {
    const mentor = await t.json<RelationshipType>(
      t.request('/api/v1/relationship-types', {
        method: 'POST',
        json: { name: 'Mentor/in', reverseName: 'Mentee', symmetric: false },
      }),
      201,
    );
    expect(mentor).toMatchObject({ name: 'Mentor/in', reverseName: 'Mentee' });
    const neighbour = await t.json<RelationshipType>(
      t.request('/api/v1/relationship-types', {
        method: 'POST',
        json: { name: 'Nachbar/in', symmetric: true },
      }),
      201,
    );
    expect(neighbour.reverseName).toBe('Nachbar/in');

    const missing = await t.request('/api/v1/relationship-types', {
      method: 'POST',
      json: { name: 'Pate', symmetric: false },
    });
    expect(missing.status).toBe(400);

    const renamed = await t.json<RelationshipType>(
      t.request(`/api/v1/relationship-types/${t.typeId('friend')}`, {
        method: 'PATCH',
        json: { name: 'Kumpel' },
      }),
    );
    expect(renamed).toMatchObject({
      name: 'Kumpel',
      reverseName: 'Kumpel',
      nameKey: null,
      reverseNameKey: null,
    });
  });
});

describe('custom fields', () => {
  it('creates definitions with unique keys and validates select options', async () => {
    const a = await t.json<FieldDefinition>(
      t.request('/api/v1/field-definitions', {
        method: 'POST',
        json: { target: 'person', label: 'Lieblings-Getränk', type: 'text' },
      }),
      201,
    );
    const b = await t.json<FieldDefinition>(
      t.request('/api/v1/field-definitions', {
        method: 'POST',
        json: { target: 'person', label: 'Lieblings Getränk', type: 'text' },
      }),
      201,
    );
    expect([a.key, b.key]).toEqual(['lieblings_getrank', 'lieblings_getrank_2']);

    const noOptions = await t.request('/api/v1/field-definitions', {
      method: 'POST',
      json: { target: 'person', label: 'Größe', type: 'select' },
    });
    expect(noOptions.status).toBe(400);

    const { fieldDefinitions } = await t.json<{ fieldDefinitions: FieldDefinition[] }>(
      t.request('/api/v1/field-definitions?target=organization'),
    );
    expect(fieldDefinitions).toEqual([]);
  });
});
