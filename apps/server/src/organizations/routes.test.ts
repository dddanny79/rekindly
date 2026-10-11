import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Organization, OrganizationListItem, Person } from '@app/shared';
import { createSignedInApp } from '../test/helpers';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const createOrg = (name: string, extra: Record<string, unknown> = {}) =>
  t.json<Organization>(
    t.request('/api/v1/organizations', {
      method: 'POST',
      json: { spaceId: t.businessSpace, name, ...extra },
    }),
    201,
  );

describe('organizations', () => {
  it('builds a hierarchy and shows the path in the person header (acceptance)', async () => {
    const ag = await createOrg('Beispiel AG', { kind: 'company' });
    const gmbh = await createOrg('Beispiel GmbH', { parentId: ag.id });
    const site = await createOrg('Standort Köln', { parentId: gmbh.id, kind: 'site' });
    expect(site.path.map((p) => p.name)).toEqual(['Beispiel AG', 'Beispiel GmbH', 'Standort Köln']);

    const person = await t.json<Person>(
      t.request('/api/v1/people', {
        method: 'POST',
        json: {
          spaceId: t.businessSpace,
          firstName: 'Jana',
          lastName: 'Berger',
          organizationId: site.id,
          role: 'Leitung Einkauf',
        },
      }),
      201,
    );
    expect(person.affiliations).toHaveLength(1);
    expect(person.affiliations[0]).toMatchObject({ role: 'Leitung Einkauf', isPrimary: true });
    expect(person.affiliations[0]!.organization.path.map((p) => p.name)).toEqual([
      'Beispiel AG',
      'Beispiel GmbH',
      'Standort Köln',
    ]);

    const agDetail = await t.json<Organization>(t.request(`/api/v1/organizations/${ag.id}`));
    expect(agDetail.children.map((c) => c.name)).toEqual(['Beispiel GmbH']);

    // People filter includes sub-organizations.
    const { people } = await t.json<{ people: { displayName: string; role: string }[] }>(
      t.request(`/api/v1/people?organizationId=${ag.id}`),
    );
    expect(people).toEqual([
      expect.objectContaining({ displayName: 'Jana Berger', role: 'Leitung Einkauf' }),
    ]);
  });

  it('prevents cycles and cross-space parents', async () => {
    const a = await createOrg('A');
    const b = await createOrg('B', { parentId: a.id });
    const c = await createOrg('C', { parentId: b.id });
    for (const parentId of [a.id, c.id]) {
      const res = await t.request(`/api/v1/organizations/${a.id}`, {
        method: 'PATCH',
        json: { parentId },
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'organization_cycle' });
    }
    const other = await createOrg('Privatverein', { spaceId: t.privateSpace });
    const res = await t.request(`/api/v1/organizations/${other.id}`, {
      method: 'PATCH',
      json: { parentId: a.id },
    });
    expect(await res.json()).toEqual({ error: 'space_mismatch' });

    // Moving to the top level is fine.
    const moved = await t.json<Organization>(
      t.request(`/api/v1/organizations/${c.id}`, { method: 'PATCH', json: { parentId: null } }),
    );
    expect(moved.path.map((p) => p.name)).toEqual(['C']);
  });

  it('separates current and former members', async () => {
    const org = await createOrg('Kessler Catering GmbH');
    const person = await t.json<Person>(
      t.request('/api/v1/people', {
        method: 'POST',
        json: { spaceId: t.businessSpace, firstName: 'Jana', lastName: 'Berger' },
      }),
      201,
    );
    const former = await t.json<{ id: string }>(
      t.request(`/api/v1/people/${person.id}/affiliations`, {
        method: 'POST',
        json: {
          organizationId: org.id,
          role: 'Einkäuferin',
          startedOn: '2017',
          endedOn: '2026-02',
        },
      }),
      201,
    );
    let detail = await t.json<Organization>(t.request(`/api/v1/organizations/${org.id}`));
    expect(detail.currentMembers).toEqual([]);
    expect(detail.formerMembers.map((m) => m.affiliationId)).toEqual([former.id]);

    await t.request(`/api/v1/people/${person.id}/affiliations/${former.id}`, {
      method: 'PATCH',
      json: { endedOn: null },
    });
    detail = await t.json<Organization>(t.request(`/api/v1/organizations/${org.id}`));
    expect(detail.currentMembers.map((m) => m.role)).toEqual(['Einkäuferin']);

    const { organizations } = await t.json<{ organizations: OrganizationListItem[] }>(
      t.request('/api/v1/organizations'),
    );
    expect(organizations[0]!.peopleCount).toBe(1);
  });

  it('rejects affiliations across spaces', async () => {
    const org = await createOrg('Beispiel GmbH');
    const res = await t.request('/api/v1/people', {
      method: 'POST',
      json: {
        spaceId: t.privateSpace,
        firstName: 'Clara',
        lastName: 'Weidemann',
        organizationId: org.id,
      },
    });
    expect(await res.json()).toEqual({ error: 'space_mismatch' });
  });

  it('soft-deletes and filters by space and name', async () => {
    const org = await createOrg('Plöger Automaten');
    await createOrg('Sportverein', { spaceId: t.privateSpace });
    const names = async (query: string) =>
      (
        await t.json<{ organizations: OrganizationListItem[] }>(
          t.request(`/api/v1/organizations${query}`),
        )
      ).organizations.map((o) => o.name);
    expect(await names(`?spaceId=${t.privateSpace}`)).toEqual(['Sportverein']);
    expect(await names('?q=ploeger')).toEqual(['Plöger Automaten']);
    await t.request(`/api/v1/organizations/${org.id}`, { method: 'DELETE' });
    expect(await names('')).toEqual(['Sportverein']);
  });
});
