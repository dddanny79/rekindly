import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { Entry, Organization, Person, SearchResponse } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import type { ExportFile } from './service';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

const post = <T>(t: App, path: string, json: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
const patch = <T>(t: App, path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'PATCH', json }));

/** An instance with a bit of everything, including a photo and the trash. */
async function filled() {
  const t = await app();
  const company = await post<Organization>(t, '/organizations', {
    spaceId: t.businessSpace,
    name: 'Beispiel GmbH',
  });
  const site = await post<Organization>(t, '/organizations', {
    spaceId: t.businessSpace,
    name: 'Standort Köln',
    parentId: company.id,
  });
  const jana = await post<Person>(t, '/people', {
    spaceId: t.businessSpace,
    firstName: 'Jana',
    lastName: 'Müller',
    organizationId: site.id,
    role: 'Einkauf',
  });
  await patch(t, `/people/${jana.id}`, {
    birthday: '--10-24',
    summary: 'Kundin',
    nickname: 'Jani',
  });
  const tom = await post<Person>(t, '/people', {
    spaceId: t.privateSpace,
    firstName: 'Tom',
    lastName: 'Weber',
  });
  await post(t, `/people/${jana.id}/contact-points`, {
    kind: 'phone',
    label: 'Mobil',
    value: '+49 170 1',
  });
  await post(t, `/people/${jana.id}/addresses`, {
    street: 'Domplatz 1',
    zip: '50667',
    city: 'Köln',
  });
  await post(t, `/people/${jana.id}/facts`, { text: 'Tochter Lea', pinned: true });
  await post(t, `/people/${jana.id}/tags`, { name: 'kunde' });
  await post(t, `/people/${jana.id}/relationships`, {
    personId: tom.id,
    typeId: t.typeId('friend'),
  });
  await post(t, `/people/${jana.id}/relationships`, {
    newPerson: { firstName: 'Lea', lastName: 'Müller' },
    typeId: t.typeId('parent'),
    reverse: true,
  });
  const field = await post<{ id: string }>(t, '/field-definitions', {
    target: 'person',
    label: 'Lieblingsgetränk',
    type: 'text',
  });
  await t.json(
    t.request(`/api/v1/people/${jana.id}/fields/${field.id}`, {
      method: 'PUT',
      json: { value: 'Tee' },
    }),
  );
  await post<Entry>(t, '/entries', {
    kind: 'call',
    direction: 'in',
    bodyMd: 'Über das **Angebot** gesprochen',
    personIds: [jana.id, tom.id],
    reminder: { dueOn: '2026-11-01' },
  });
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#4a6' } })
    .png()
    .toBuffer();
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'p.png');
  await t.request(`/api/v1/people/${jana.id}/photo`, { method: 'PUT', body });
  // Something in the trash.
  const gone = await post<Person>(t, '/people', { spaceId: t.privateSpace, firstName: 'Gina' });
  await t.request(`/api/v1/people/${gone.id}`, { method: 'DELETE' });
  return { t, jana };
}

async function exportOf(t: App) {
  const res = await t.request('/api/v1/export/json');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-disposition')).toMatch(
    /attachment; filename="personengedaechtnis-export-/,
  );
  return (await res.json()) as ExportFile;
}

describe('export and import', () => {
  it('restores an export into an empty instance with identical data (acceptance)', async () => {
    const { t: source, jana } = await filled();
    const exported = await exportOf(source);
    expect(exported).toMatchObject({ format: 'personengedaechtnis-export', version: 1 });
    expect(exported.data.people).toHaveLength(4);
    expect(exported.data.files).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain('password');

    const target = await app();
    expect(await target.json(target.request('/api/v1/import/status'))).toEqual({ empty: true });
    const res = await target.json<{ imported: Record<string, number> }>(
      target.request('/api/v1/import', { method: 'POST', json: exported }),
    );
    expect(res.imported).toMatchObject({ people: 4, organizations: 2, entries: 1, files: 1 });

    // Round trip: exporting the restored instance gives the same data.
    const again = await exportOf(target);
    expect(again.data).toEqual(exported.data);

    // And the app works with it: person page, photo, search, trash.
    const person = await target.json<Person>(target.request(`/api/v1/people/${jana.id}`));
    expect(person).toMatchObject({ displayName: 'Jana (Jani) Müller', birthday: '--10-24' });
    expect((await target.request(person.photoUrl!)).status).toBe(200);
    const found = await target.json<SearchResponse>(target.request('/api/v1/search?q=angebot'));
    expect(found.results.map((r) => r.id).sort()).toEqual(
      exported.data.people
        .filter((p) => ['Jana', 'Tom'].includes(p.firstName as string))
        .map((p) => p.id)
        .sort(),
    );
    const trash = await target.json<{ items: { label: { name: string } }[] }>(
      target.request('/api/v1/trash'),
    );
    expect(trash.items.map((i) => i.label.name)).toEqual(['Gina']);
    expect(await target.json(target.request('/api/v1/import/status'))).toEqual({ empty: false });
  });

  it('refuses to import into an instance that has data, and broken files', async () => {
    const { t } = await filled();
    const exported = await exportOf(t);
    expect((await t.request('/api/v1/import', { method: 'POST', json: exported })).status).toBe(
      409,
    );

    const empty = await app();
    const bad = async (json: unknown, status = 400) =>
      expect((await empty.request('/api/v1/import', { method: 'POST', json })).status).toBe(status);
    await bad({ hello: 'world' });
    await bad({ ...exported, version: 99 });
    // A photo whose content does not match its checksum.
    await bad({
      ...exported,
      data: { ...exported.data, files: [{ ...exported.data.files[0], data: 'AAAA' }] },
    });
    // A reference to something that is not there: nothing is imported.
    await bad({
      ...exported,
      data: { ...exported.data, organizations: [] },
    });
    expect(await empty.json(empty.request('/api/v1/import/status'))).toEqual({ empty: true });
  });

  it('exports contacts as vCards, all or one space, without indirect contacts', async () => {
    const { t } = await filled();
    const all = await t.request('/api/v1/export/vcf');
    expect(all.headers.get('content-type')).toContain('text/vcard');
    const text = await all.text();
    expect(text.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(text).toContain('FN:Jana Müller');
    expect(text).toContain('FN:Tom Weber');
    expect(text).not.toContain('Lea');
    expect(text).toContain('PHOTO;ENCODING=b;TYPE=JPEG:');
    const business = await (
      await t.request(`/api/v1/export/vcf?spaceId=${t.businessSpace}`)
    ).text();
    expect(business.match(/BEGIN:VCARD/g)).toHaveLength(1);
  });
});
