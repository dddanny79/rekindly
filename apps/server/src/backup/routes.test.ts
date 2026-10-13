import { rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Entry,
  Organization,
  Person,
  SearchResponse,
  ThemeListResponse,
  ThemeRecord,
} from '@app/shared';
import { setTwoFactor, twoFactorEnabled } from '../auth/two-factor';
import { updateMailStatus } from '../mail/config';
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
  await post(t, `/people/${jana.id}/questions`, { text: 'Wie war der Urlaub?' });
  await post(t, `/people/${jana.id}/dates`, { kind: 'wedding', date: '2015-06-12' });
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
  expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="rekindly-export-/);
  return (await res.json()) as ExportFile;
}

describe('export and import', () => {
  it('restores an export into an empty instance with identical data (acceptance)', async () => {
    const { t: source, jana } = await filled();
    const exported = await exportOf(source);
    expect(exported).toMatchObject({ format: 'rekindly-export', version: 3 });
    expect(exported.data.people).toHaveLength(4);
    expect(exported.data.files).toHaveLength(1);
    expect(exported.data.questions).toHaveLength(1);
    expect(exported.data.personDates).toHaveLength(1);
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
    expect(person.questions.map((q) => q.text)).toEqual(['Wie war der Urlaub?']);
    expect(person.dates.map((d) => d.kind)).toEqual(['wedding']);
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

  it('still imports exports from before the rename', async () => {
    const { t } = await filled();
    const exported = await exportOf(t);
    const empty = await app();
    const res = await empty.request('/api/v1/import', {
      method: 'POST',
      json: { ...exported, format: 'personengedaechtnis-export' },
    });
    expect(res.status).toBe(200);
  });

  it('carries own themes, but leaves sign-in codes and mail state with the instance', async () => {
    const { t } = await filled();
    const own = await t.json<ThemeRecord>(
      t.request('/api/v1/themes', {
        method: 'POST',
        json: { theme: { format: 'rekindly-theme', version: 1, name: 'Mitgenommen' } },
      }),
      201,
    );
    await t.request('/api/v1/themes/defaults', {
      method: 'PUT',
      json: { defaultThemeId: own.id },
    });
    setTwoFactor(t.db, true);
    updateMailStatus(t.db, { lastSentAt: '2026-10-13T08:00:00.000Z', lastError: null });

    const exported = await exportOf(t);
    expect(exported.data.themes).toHaveLength(1);
    const keys = exported.data.settings.map((row) => row.key);
    expect(keys).toContain('appearance.defaultTheme');
    expect(keys).not.toContain('auth.twoFactor');
    expect(keys).not.toContain('mail.status');

    // A file that still carries the switch (e.g. from 0.2 before this fix) must not
    // turn on sign-in codes on a server that cannot send them.
    const target = await app();
    const withSwitch = {
      ...exported,
      data: {
        ...exported.data,
        settings: [
          ...exported.data.settings,
          {
            key: 'auth.twoFactor',
            value: { enabled: true },
            updatedAt: '2026-10-13T08:00:00.000Z',
          },
        ],
      },
    };
    await target.json(target.request('/api/v1/import', { method: 'POST', json: withSwitch }));
    expect(twoFactorEnabled(target.db)).toBe(false);
    const list = await target.json<ThemeListResponse>(target.request('/api/v1/themes'));
    expect(list.defaultThemeId).toBe(own.id);
    expect(list.themes.find((th) => th.id === own.id)?.theme.name).toBe('Mitgenommen');
  });

  it('stays restorable when a photo file went missing on disk', async () => {
    const { t, jana } = await filled();
    const before = await exportOf(t);
    // An older export that still points to a photo it does not contain.
    const dangling = { ...before, data: { ...before.data, files: [] } };
    const target = await app();
    expect(
      (await target.request('/api/v1/import', { method: 'POST', json: dangling })).status,
    ).toBe(200);
    expect(
      (await target.json<Person>(target.request(`/api/v1/people/${jana.id}`))).photoUrl,
    ).toBeNull();

    // The photo disappears from disk: the export leaves out file and reference.
    const photo = before.data.files[0]!;
    rmSync(join(t.dataDir, 'files', String(photo.path)));
    const after = await exportOf(t);
    expect(after.data.files).toHaveLength(0);
    expect(after.data.people.find((p) => p.id === jana.id)?.photoFileId).toBeNull();
  });

  it('imports files of version 1 (no themes) and 2 (no questions)', async () => {
    const { t } = await filled();
    const exported = await exportOf(t);
    const v2: Partial<typeof exported.data> = { ...exported.data };
    delete v2.questions;
    delete v2.personDates;
    const v1: Partial<typeof exported.data> = { ...v2 };
    delete v1.themes;
    for (const [version, data] of [
      [1, v1],
      [2, v2],
    ] as const) {
      const empty = await app();
      const res = await empty.request('/api/v1/import', {
        method: 'POST',
        json: { ...exported, version, data },
      });
      expect(res.status).toBe(200);
    }
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
