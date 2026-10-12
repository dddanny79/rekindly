import { afterEach, describe, expect, it } from 'vitest';
import type {
  ContactImport,
  ContactImportPreview,
  Person,
  trashListResponseSchema,
} from '@app/shared';
import type { z } from 'zod';
import { createSignedInApp } from '../test/helpers';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const apps: App[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

async function app() {
  const t = await createSignedInApp();
  apps.push(t);
  return t;
}

const card = (lines: string[]) =>
  ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

const VCF = [
  // Already there (same email): skipped by default, or completed.
  card([
    'N:Müller;Jana;;;',
    'EMAIL:jana@example.com',
    'TEL;type=CELL:+49 170 5550001',
    'BDAY:1990-05-01',
  ]),
  card([
    'N:Musterfrau;Erika;;;',
    'ORG:Neue Firma GmbH',
    'TITLE:Leitung',
    'EMAIL:erika@example.com',
    'CATEGORIES:Importiert',
    'NOTE:Erste Zeile\\nZweite Zeile',
  ]),
  // Twice in the file.
  card(['N:Mustermann;Max;;;', 'TEL:0171 1234567']),
  card(['N:Mustermann;Max;;;', 'TEL:+49 171 1234567']),
].join('\r\n');

function upload(t: App, path: string, content: string, name: string, options: unknown = {}) {
  const form = new FormData();
  form.set('file', new File([content], name));
  form.set('options', JSON.stringify(options));
  return t.request(`/api/v1/contact-imports${path}`, { method: 'POST', body: form });
}

async function withJana(t: App) {
  const jana = await t.json<Person>(
    t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: t.privateSpace, firstName: 'Jana', lastName: 'Müller' },
    }),
    201,
  );
  await t.json(
    t.request(`/api/v1/people/${jana.id}/contact-points`, {
      method: 'POST',
      json: { kind: 'email', value: 'Jana@Example.com' },
    }),
    201,
  );
  return jana;
}

describe('contact import', () => {
  it('preview: new contacts, duplicates of existing people and within the file', async () => {
    const t = await app();
    const jana = await withJana(t);
    const preview = await t.json<ContactImportPreview>(upload(t, '/preview', VCF, 'iphone.vcf'));
    expect(preview.format).toBe('vcard');
    expect(preview.contacts.map((c) => [c.displayName, c.action])).toEqual([
      ['Jana Müller', 'skip'],
      ['Erika Musterfrau', 'create'],
      ['Max Mustermann', 'create'],
      ['Max Mustermann', 'skip'],
    ]);
    expect(preview.contacts[0]!.match).toMatchObject({
      personId: jana.id,
      reasons: ['email', 'name'],
    });
    expect(preview.contacts[3]!.match).toMatchObject({
      personId: null,
      fileIndex: 2,
      reasons: ['phone', 'name'],
    });
    expect(preview.contacts[1]!.details).toBe('Neue Firma GmbH · erika@example.com');
  });

  it('imports, completes an existing person and undoes exactly that', async () => {
    const t = await app();
    const jana = await withJana(t);
    const result = await t.json<ContactImport>(
      upload(t, '', VCF, 'iphone.vcf', { spaceId: t.businessSpace, actions: { '0': 'merge' } }),
      201,
    );
    expect(result).toMatchObject({
      format: 'vcard',
      created: 2,
      merged: 1,
      skipped: 1,
      undoneAt: null,
    });

    const people = await t.json<{ people: { id: string; displayName: string }[] }>(
      t.request('/api/v1/people'),
    );
    const erikaRef = people.people.find((p) => p.displayName === 'Erika Musterfrau')!;
    const erika = await t.json<Person>(t.request(`/api/v1/people/${erikaRef.id}`));
    expect(erika.spaceId).toBe(t.businessSpace);
    expect(erika.affiliations[0]).toMatchObject({ role: 'Leitung' });
    expect(erika.tags.map((tag) => tag.name)).toEqual(['Importiert']);
    // A multi-line note goes to the timeline.
    expect(erika.summary).toBeNull();
    const timeline = await t.json<{ entries: { bodyMd: string }[] }>(
      t.request(`/api/v1/entries?personId=${erika.id}`),
    );
    expect(timeline.entries[0]!.bodyMd).toBe('Erste Zeile\nZweite Zeile');

    let merged = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(merged.birthday).toBe('1990-05-01');
    expect(merged.contactPoints.map((p) => p.value)).toEqual([
      'Jana@Example.com',
      '+49 170 5550001',
    ]);

    const list = await t.json<ContactImport[]>(t.request('/api/v1/contact-imports'));
    expect(list).toHaveLength(1);

    const undone = await t.json<ContactImport>(
      t.request(`/api/v1/contact-imports/${result.id}/undo`, { method: 'POST' }),
    );
    expect(undone.undoneAt).not.toBeNull();
    const after = await t.json<{ people: { displayName: string }[] }>(t.request('/api/v1/people'));
    expect(after.people.map((p) => p.displayName)).toEqual(['Jana Müller']);
    merged = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(merged.birthday).toBeNull();
    expect(merged.contactPoints.map((p) => p.value)).toEqual(['Jana@Example.com']);
    // Created people and the new organization are in the trash, restorable.
    const trash = await t.json<z.infer<typeof trashListResponseSchema>>(t.request('/api/v1/trash'));
    const names = trash.items.map((i) => i.label.name);
    expect(names).toEqual(
      expect.arrayContaining(['Erika Musterfrau', 'Max Mustermann', 'Neue Firma GmbH']),
    );

    const again = await t.request(`/api/v1/contact-imports/${result.id}/undo`, { method: 'POST' });
    expect(again.status).toBe(409);
  });

  it('undo keeps a field the user changed after the import', async () => {
    const t = await app();
    const jana = await withJana(t);
    const result = await t.json<ContactImport>(
      upload(t, '', VCF, 'iphone.vcf', { spaceId: t.privateSpace, actions: { '0': 'merge' } }),
      201,
    );
    await t.json(
      t.request(`/api/v1/people/${jana.id}`, { method: 'PATCH', json: { birthday: '1990-05-02' } }),
    );
    await t.json(t.request(`/api/v1/contact-imports/${result.id}/undo`, { method: 'POST' }));
    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.birthday).toBe('1990-05-02');
  });

  it('CSV: preview with the detected mapping, import with a custom one', async () => {
    const t = await app();
    const csv = 'Name;Telefon;Notiz\nErika Musterfrau;0171 1;Kollegin\n';
    const preview = await t.json<ContactImportPreview>(upload(t, '/preview', csv, 'kontakte.csv'));
    expect(preview.csv).toMatchObject({
      template: 'generic',
      headers: ['Name', 'Telefon', 'Notiz'],
      samples: [['Erika Musterfrau', '0171 1', 'Kollegin']],
    });
    expect(preview.csv!.mapping.map((c) => c?.field ?? null)).toEqual([
      'fullName',
      'phone',
      'note',
    ]);
    const mapping = [{ field: 'fullName' }, { field: 'phone', label: 'Mobile' }, null];
    const again = await t.json<ContactImportPreview>(
      upload(t, '/preview', csv, 'kontakte.csv', { mapping }),
    );
    expect(again.csv!.mapping[2]).toBeNull();
    await t.json(upload(t, '', csv, 'kontakte.csv', { spaceId: t.privateSpace, mapping }), 201);
    const people = await t.json<{ people: { id: string }[] }>(t.request('/api/v1/people'));
    const erika = await t.json<Person>(t.request(`/api/v1/people/${people.people[0]!.id}`));
    expect(erika).toMatchObject({ firstName: 'Erika', lastName: 'Musterfrau', summary: null });
    expect(erika.contactPoints[0]).toMatchObject({ label: 'Mobil', value: '0171 1' });
  });

  it('rejects other files, missing spaces and imports without anything to do', async () => {
    const t = await app();
    expect((await upload(t, '/preview', '{"format":"x"}', 'export.json')).status).toBe(400);
    expect((await upload(t, '', VCF, 'a.vcf', { spaceId: 'nope' })).status).toBe(400);
    const skipAll = { '0': 'skip', '1': 'skip', '2': 'skip', '3': 'skip' };
    const res = await upload(t, '', VCF, 'a.vcf', { spaceId: t.privateSpace, actions: skipAll });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'import_nothing' });
    const missing = await t.request('/api/v1/contact-imports/preview', {
      method: 'POST',
      body: new FormData(),
    });
    expect(missing.status).toBe(400);
  });
});
