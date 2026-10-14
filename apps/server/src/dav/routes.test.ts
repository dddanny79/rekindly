import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateAppPasswordResponse, Entry, Person, TrashItem } from '@app/shared';
import { createSignedInApp, OWNER } from '../test/helpers';
import { unfold } from './vcard';
import { adoptKeptDates } from './inbound';
import { davExtras } from '../db/schema';

let t: Awaited<ReturnType<typeof createSignedInApp>>;
beforeEach(async () => {
  t = await createSignedInApp();
});
afterEach(() => t.cleanup());

const post = <T>(path: string, json: unknown, status = 201) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'POST', json }), status);
const patch = <T>(path: string, json: unknown) =>
  t.json<T>(t.request(`/api/v1${path}`, { method: 'PATCH', json }));

async function person(
  firstName: string,
  lastName: string,
  extra: Record<string, unknown> = {},
  spaceId = t.businessSpace,
) {
  const created = await post<Person>('/people', { spaceId, firstName, lastName });
  return Object.keys(extra).length ? patch<Person>(`/people/${created.id}`, extra) : created;
}

async function appPassword(spaceIds: string[] | null = null) {
  return post<CreateAppPasswordResponse>('/app-passwords', { name: 'iPhone', spaceIds });
}

/** A CardDAV client: Basic auth, no cookies. */
function client(username: string, password: string) {
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  return (method: string, path: string, body?: string, headers: Record<string, string> = {}) =>
    t.app.request(path, { method, body, headers: { authorization: auth, ...headers } });
}

const PROPFIND = (props: string) =>
  `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"><d:prop>${props}</d:prop></d:propfind>`;

const hrefs = (xml: string) => [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => m[1]!);

async function davClient(spaceIds: string[] | null = null) {
  const created = await appPassword(spaceIds);
  return client(created.username, created.password);
}

describe('app passwords', () => {
  it('are created once, listed without the password and revoked', async () => {
    const created = await appPassword([t.privateSpace]);
    expect(created.password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(created.username).toBe(OWNER.email);
    expect(created.server).toBe('localhost:3000');
    expect(created.url).toBe('http://localhost:3000/dav/');
    const { appPasswords } = await t.json<{ appPasswords: object[] }>(
      t.request('/api/v1/app-passwords'),
    );
    expect(appPasswords).toEqual([
      expect.objectContaining({ name: 'iPhone', spaceIds: [t.privateSpace] }),
    ]);
    expect(JSON.stringify(appPasswords)).not.toContain(created.password);

    const dav = client(created.username, created.password);
    expect((await dav('PROPFIND', '/dav/', PROPFIND('<d:current-user-principal/>'))).status).toBe(
      207,
    );
    await t.request(`/api/v1/app-passwords/${created.appPassword.id}`, { method: 'DELETE' });
    expect((await dav('PROPFIND', '/dav/')).status).toBe(401);
    expect(await post('/app-passwords', { name: 'x', spaceIds: ['nope'] }, 400)).toBeTruthy();
  });
});

describe('CardDAV', () => {
  it('asks for credentials and rejects the login password', async () => {
    const created = await appPassword();
    const anonymous = await t.app.request('/dav/', { method: 'PROPFIND' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toContain('Basic');
    expect((await client(OWNER.email, OWNER.password)('PROPFIND', '/dav/')).status).toBe(401);
    expect((await client('someone@else', created.password)('PROPFIND', '/dav/')).status).toBe(401);
    // The email is case-insensitive.
    expect(
      (await client(OWNER.email.toUpperCase(), created.password)('PROPFIND', '/dav/')).status,
    ).toBe(207);
  });

  it('is discovered like iOS does it', async () => {
    const dav = await davClient();
    const wellKnown = await t.app.request('/.well-known/carddav', { method: 'PROPFIND' });
    expect(wellKnown.status).toBe(301);
    expect(wellKnown.headers.get('location')).toBe('/dav/');

    const root = await (
      await dav('PROPFIND', '/dav/', PROPFIND('<d:current-user-principal/>'))
    ).text();
    expect(root).toContain('<d:current-user-principal><d:href>/dav/principal/</d:href>');
    const principal = await (
      await dav(
        'PROPFIND',
        '/dav/principal/',
        PROPFIND('<card:addressbook-home-set/><d:displayname/>'),
      )
    ).text();
    expect(principal).toContain('<card:addressbook-home-set><d:href>/dav/addressbooks/</d:href>');
    expect(principal).toContain(`<d:displayname>${OWNER.name}</d:displayname>`);

    const home = await (
      await dav(
        'PROPFIND',
        '/dav/addressbooks/',
        PROPFIND(
          '<d:resourcetype/><d:displayname/><cs:getctag/><d:current-user-privilege-set/><x:foo xmlns:x="urn:x"/>',
        ),
        { depth: '1' },
      )
    ).text();
    expect(home).toContain('<d:href>/dav/addressbooks/contacts/</d:href>');
    expect(home).toContain('<card:addressbook/>');
    expect(home).toContain('<d:privilege><d:write/></d:privilege>');
    // Unknown properties are reported as 404 in their own namespace.
    expect(home).toMatch(/<x\d:foo xmlns:x\d="urn:x"\/>.*404 Not Found/);
  });

  it('lists only synced contacts of the password’s spaces', async () => {
    const jana = await person('Jana', 'Berger');
    const archived = await person('Arne', 'Archiv', { archived: true });
    const trashed = await person('Tina', 'Trash');
    await t.request(`/api/v1/people/${trashed.id}`, { method: 'DELETE' });
    await post(`/people/${jana.id}/relationships`, {
      newPerson: { firstName: 'Lea', lastName: 'Berger' },
      typeId: t.typeId('parent'),
      reverse: true,
    });
    const privat = await person('Paul', 'Privat', {}, t.privateSpace);

    const list = async (spaceIds: string[] | null) => {
      const dav = await davClient(spaceIds);
      const xml = await (
        await dav('PROPFIND', '/dav/addressbooks/contacts/', PROPFIND('<d:getetag/>'), {
          depth: '1',
        })
      ).text();
      return hrefs(xml).filter((h) => h.endsWith('.vcf'));
    };
    expect((await list(null)).sort()).toEqual(
      [
        `/dav/addressbooks/contacts/${jana.id}.vcf`,
        `/dav/addressbooks/contacts/${privat.id}.vcf`,
      ].sort(),
    );
    expect(await list([t.privateSpace])).toEqual([`/dav/addressbooks/contacts/${privat.id}.vcf`]);
    expect(archived.archivedAt).not.toBeNull();
  });

  it('serves vCards with deep link, yearless birthday and organization', async () => {
    const company = await post<{ id: string }>('/organizations', {
      spaceId: t.businessSpace,
      name: 'Beispiel GmbH',
    });
    const site = await post<{ id: string }>('/organizations', {
      spaceId: t.businessSpace,
      name: 'Standort Köln',
      parentId: company.id,
    });
    const jana = await post<Person>('/people', {
      spaceId: t.businessSpace,
      firstName: 'Jana',
      lastName: 'Müller',
      organizationId: site.id,
      role: 'Einkauf',
    });
    await patch(`/people/${jana.id}`, { birthday: '--10-24', summary: 'Kundin' });
    await post(`/people/${jana.id}/contact-points`, {
      kind: 'phone',
      label: 'Mobil',
      value: '+49 170 5550142',
    });

    const dav = await davClient();
    const res = await dav('GET', `/dav/addressbooks/contacts/${jana.id}.vcf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/vcard');
    const lines = unfold(await res.text());
    expect(lines).toEqual(
      expect.arrayContaining([
        'N:Müller;Jana;;;',
        'BDAY;X-APPLE-OMIT-YEAR=1604:1604-10-24',
        'ORG:Beispiel GmbH;Standort Köln',
        'TITLE:Einkauf',
        'NOTE:Kundin',
        'TEL;type=CELL:+49 170 5550142',
        `applink.URL:http://localhost:3000/people/${jana.id}`,
      ]),
    );
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{20}"$/);

    const multi = await (
      await dav(
        'REPORT',
        '/dav/addressbooks/contacts/',
        `<card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop><d:href>/dav/addressbooks/contacts/${jana.id}.vcf</d:href><d:href>/dav/addressbooks/contacts/missing.vcf</d:href></card:addressbook-multiget>`,
      )
    ).text();
    expect(multi).toContain('N:Müller;Jana;;;');
    expect(multi).toMatch(/missing\.vcf<\/d:href><d:status>HTTP\/1.1 404/);
  });

  it('reports changes and removals with sync-collection', async () => {
    const jana = await person('Jana', 'Berger');
    const tom = await person('Tom', 'Weber');
    const dav = await davClient();
    const sync = async (token: string) =>
      (
        await dav(
          'REPORT',
          '/dav/addressbooks/contacts/',
          `<d:sync-collection xmlns:d="DAV:"><d:sync-token>${token}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`,
        )
      ).text();
    const first = await sync('');
    expect(hrefs(first).length).toBe(2);
    const token = /<d:sync-token>([^<]+)<\/d:sync-token>/.exec(first)![1]!;
    expect(token).toMatch(/^http:\/\/localhost:3000\/dav\/sync\/\d+$/);

    expect(hrefs(await sync(token))).toEqual([]);
    await patch(`/people/${jana.id}`, { lastName: 'Berger-Klein' });
    await t.request(`/api/v1/people/${tom.id}`, { method: 'DELETE' });
    const changes = await sync(token);
    expect(changes).toContain(
      `<d:href>/dav/addressbooks/contacts/${jana.id}.vcf</d:href><d:propstat>`,
    );
    expect(changes).toContain(
      `<d:href>/dav/addressbooks/contacts/${tom.id}.vcf</d:href><d:status>HTTP/1.1 404 Not Found</d:status>`,
    );

    const invalid = await dav(
      'REPORT',
      '/dav/addressbooks/contacts/',
      '<d:sync-collection xmlns:d="DAV:"><d:sync-token>http://x/dav/sync/999999</d:sync-token></d:sync-collection>',
    );
    expect(invalid.status).toBe(403);
    expect(await invalid.text()).toContain('valid-sync-token');
  });

  it('takes changes from the phone, trashes removed details and logs them (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    await post(`/people/${jana.id}/contact-points`, {
      kind: 'phone',
      label: 'Mobil',
      value: '+49 170 1',
    });
    const dav = await davClient();
    const url = `/dav/addressbooks/contacts/${jana.id}.vcf`;
    const get = await dav('GET', url);
    const etag = get.headers.get('etag')!;
    const edited = (await get.text())
      .replace('TEL;type=CELL:+49 170 1', 'TEL;type=CELL:+49 170 2')
      .replace(
        'N:Berger;Jana;;;',
        'N:Berger;Jana;;;\r\nitem7.X-ABDATE:2019-05-01\r\nitem7.X-ABLabel:_$!<Anniversary>!$_',
      );

    expect((await dav('PUT', url, edited, { 'if-match': '"stale"' })).status).toBe(412);
    expect((await dav('PUT', url, edited, { 'if-match': etag })).status).toBe(204);

    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.contactPoints.map((p) => p.value)).toEqual(['+49 170 2']);
    const trash = await t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash'));
    expect(trash.items).toEqual([
      expect.objectContaining({
        kind: 'contactPoint',
        label: { name: '+49 170 1', nameKey: null },
      }),
    ]);
    const { entries } = await t.json<{ entries: Entry[] }>(
      t.request(`/api/v1/entries?personId=${jana.id}`),
    );
    expect(entries[0]).toMatchObject({ kind: 'note', title: 'Über Sync geändert', source: 'sync' });
    // The change log is not searchable (it would match every changed number).
    const found = await t.json<{ results: unknown[] }>(t.request('/api/v1/search?q=papierkorb'));
    expect(found.results).toEqual([]);
    expect(entries[0]!.bodyMd).toContain('Telefon hinzugefügt: +49 170 2');
    expect(entries[0]!.bodyMd).toContain('Telefon in den Papierkorb: +49 170 1');
    // The iPhone's anniversary is the wedding anniversary.
    expect(after.dates).toEqual([
      expect.objectContaining({ kind: 'wedding', label: null, date: '2019-05-01' }),
    ]);
    expect(entries[0]!.bodyMd).toContain('Hochzeitstag hinzugefügt: 2019-05-01');

    // iOS sends a yearless birthday back without X-APPLE-OMIT-YEAR: still yearless.
    const current = await dav('GET', url);
    const yearless = (await current.text()).replace(
      'N:Berger;Jana;;;',
      'N:Berger;Jana;;;\r\nBDAY;VALUE=date:1604-10-24',
    );
    expect(
      (await dav('PUT', url, yearless, { 'if-match': current.headers.get('etag')! })).status,
    ).toBe(204);
    expect((await t.json<Person>(t.request(`/api/v1/people/${jana.id}`))).birthday).toBe('--10-24');

    // And goes back to the phone as Apple's anniversary.
    const back = unfold(await (await dav('GET', url)).text());
    const group = back.find((l) => l.endsWith('.X-ABDATE:2019-05-01'))!.split('.')[0];
    expect(back).toContain(`${group}.X-ABLabel:_$!<Anniversary>!$_`);
  });

  it('recurring days go both ways: own labels, without year, removed on the phone', async () => {
    const jana = await person('Jana', 'Berger');
    await post(`/people/${jana.id}/dates`, { kind: 'memorial', date: '--03-10' });
    await post(`/people/${jana.id}/dates`, {
      kind: 'custom',
      label: 'Hauskauf',
      date: '2019-09-01',
    });
    const dav = await davClient();
    const url = `/dav/addressbooks/contacts/${jana.id}.vcf`;
    const get = await dav('GET', url);
    const text = await get.text();
    const lines = unfold(text);
    expect(lines).toContain('item1.X-ABDATE;X-APPLE-OMIT-YEAR=1604:1604-03-10');
    expect(lines).toContain('item1.X-ABLabel:Todestag');
    expect(lines).toContain('item2.X-ABDATE:2019-09-01');
    expect(lines).toContain('item2.X-ABLabel:Hauskauf');

    // On the phone: the custom day removed, a name day added.
    const edited = text
      .replace('item2.X-ABDATE:2019-09-01\r\nitem2.X-ABLabel:Hauskauf\r\n', '')
      .replace(
        'N:Berger;Jana;;;',
        'N:Berger;Jana;;;\r\nitem9.X-ABDATE;X-APPLE-OMIT-YEAR=1604:1604-07-26\r\nitem9.X-ABLabel:Namenstag',
      );
    const put = await dav('PUT', url, edited, { 'if-match': get.headers.get('etag')! });
    expect(put.status).toBe(204);
    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.dates.map((d) => [d.kind, d.label, d.date])).toEqual([
      ['memorial', null, '--03-10'],
      ['nameday', null, '--07-26'],
    ]);
    const trash = await t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash'));
    expect(trash.items).toEqual([
      expect.objectContaining({ kind: 'personDate', label: { name: 'Hauskauf', nameKey: null } }),
    ]);
  });

  it('turns dates that older versions kept as unknown lines into recurring days', async () => {
    const jana = await person('Jana', 'Berger');
    t.db
      .insert(davExtras)
      .values({
        personId: jana.id,
        lines: [
          'extra1.X-ABDATE:2019-05-01',
          'extra1.X-ABLabel:_$!<Anniversary>!$_',
          'X-ABRELATEDNAMES:Anna',
        ].join('\n'),
      })
      .run();
    expect(adoptKeptDates(t.db, 'de')).toBe(1);
    expect(adoptKeptDates(t.db, 'de')).toBe(0);
    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.dates.map((d) => [d.kind, d.date])).toEqual([['wedding', '2019-05-01']]);
    const dav = await davClient();
    const lines = unfold(
      await (await dav('GET', `/dav/addressbooks/contacts/${jana.id}.vcf`)).text(),
    );
    expect(lines.filter((l) => l.includes('X-ABDATE'))).toEqual(['item1.X-ABDATE:2019-05-01']);
    expect(lines).toContain('X-ABRELATEDNAMES:Anna');
  });

  it('answers a PUT with the new ETag, so the next change from the phone fits', async () => {
    const jana = await person('Jana', 'Berger');
    await post(`/people/${jana.id}/contact-points`, { kind: 'email', value: 'jana@example.com' });
    const dav = await davClient();
    const url = `/dav/addressbooks/contacts/${jana.id}.vcf`;
    const first = await dav('GET', url);
    // Like iOS: change the email, PUT, then change it again with the returned ETag.
    const card1 = (await first.text()).replace('jana@example.com', 'jana@example.org');
    const put1 = await dav('PUT', url, card1, { 'if-match': first.headers.get('etag')! });
    expect(put1.status).toBe(204);
    const etag1 = put1.headers.get('etag');
    expect(etag1).toBe((await dav('GET', url)).headers.get('etag'));
    const card2 = card1.replace('jana@example.org', 'jana@example.net');
    expect((await dav('PUT', url, card2, { 'if-match': etag1! })).status).toBe(204);
    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.contactPoints.map((p) => p.value)).toEqual(['jana@example.net']);

    // When the server keeps something the phone removed, no ETag: the phone refetches.
    const company = await post<{ id: string }>('/organizations', {
      spaceId: t.businessSpace,
      name: 'Bleibt GmbH',
    });
    await post(`/people/${jana.id}/affiliations`, { organizationId: company.id, isPrimary: true });
    const withOrg = await dav('GET', url);
    const withoutOrg = (await withOrg.text()).replace(/ORG:[^\r]*\r\n/, '');
    const put3 = await dav('PUT', url, withoutOrg, { 'if-match': withOrg.headers.get('etag')! });
    expect(put3.status).toBe(204);
    expect(put3.headers.get('etag')).toBeNull();
  });

  it('takes a new photo from the phone once, not again on every save', async () => {
    const jana = await person('Jana', 'Berger');
    const dav = await davClient();
    const url = `/dav/addressbooks/contacts/${jana.id}.vcf`;
    const jpeg = (
      await sharp({
        create: { width: 40, height: 40, channels: 3, background: '#a33' },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64');
    const get = await dav('GET', url);
    const withPhoto = (await get.text()).replace(
      'END:VCARD',
      `PHOTO;ENCODING=b;TYPE=JPEG:${jpeg}\r\nEND:VCARD`,
    );
    const put1 = await dav('PUT', url, withPhoto, { 'if-match': get.headers.get('etag')! });
    expect(put1.status).toBe(204);
    const photo1 = (await t.json<Person>(t.request(`/api/v1/people/${jana.id}`))).photoUrl;
    expect(photo1).toMatch(/^\/api\/v1\/files\//);

    // Same photo again with another change: no new file, no "photo changed".
    const put2 = await dav(
      'PUT',
      url,
      withPhoto.replace('N:Berger;Jana;;;', 'N:Berger;Jana;Maria;;'),
      {
        'if-match': put1.headers.get('etag') ?? (await dav('GET', url)).headers.get('etag')!,
      },
    );
    expect(put2.status).toBe(204);
    const after = await t.json<Person>(t.request(`/api/v1/people/${jana.id}`));
    expect(after.photoUrl).toBe(photo1);
    expect(after.middleName).toBe('Maria');
    const { entries } = await t.json<{ entries: Entry[] }>(
      t.request(`/api/v1/entries?personId=${jana.id}`),
    );
    expect(entries.filter((e) => e.bodyMd.includes('Foto geändert'))).toHaveLength(1);
  });

  it('creates contacts from the phone under their own name and UID', async () => {
    const dav = await davClient([t.privateSpace]);
    const name = 'B6A1C4E2-1D2F-4E5A-9C3B-7F8E9D0A1B2C';
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `UID:${name}`,
      'N:Neu;Nora;;;',
      'FN:Nora Neu',
      'ORG:Muster AG;Vertrieb',
      'TITLE:Leitung',
      'BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-08',
      'END:VCARD',
      '',
    ].join('\r\n');
    const res = await dav('PUT', `/dav/addressbooks/contacts/${name}.vcf`, card, {
      'if-none-match': '*',
    });
    expect(res.status).toBe(201);
    const back = unfold(await (await dav('GET', `/dav/addressbooks/contacts/${name}.vcf`)).text());
    expect(back).toContain(`UID:${name}`);
    expect(back).toContain('BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-08');
    expect(back).toContain('ORG:Muster AG;Vertrieb');

    const { people } = await t.json<{
      people: {
        id: string;
        displayName: string;
        spaceId: string;
        role: string;
        organization: { name: string };
      }[];
    }>(t.request('/api/v1/people'));
    expect(people).toEqual([
      expect.objectContaining({
        displayName: 'Nora Neu',
        spaceId: t.privateSpace,
        role: 'Leitung',
        organization: expect.objectContaining({ name: 'Vertrieb' }),
      }),
    ]);
    const { entries } = await t.json<{ entries: Entry[] }>(
      t.request(`/api/v1/entries?personId=${people[0]!.id}`),
    );
    expect(entries[0]!.title).toBe('Über Sync angelegt');
    // Again with If-None-Match: it exists now.
    expect(
      (await dav('PUT', `/dav/addressbooks/contacts/${name}.vcf`, card, { 'if-none-match': '*' }))
        .status,
    ).toBe(412);
  });

  it('moves a contact deleted on the phone to the trash (acceptance)', async () => {
    const jana = await person('Jana', 'Berger');
    const dav = await davClient();
    const url = `/dav/addressbooks/contacts/${jana.id}.vcf`;
    expect((await dav('DELETE', url)).status).toBe(204);
    expect((await t.request(`/api/v1/people/${jana.id}`)).status).toBe(404);
    const trash = await t.json<{ items: TrashItem[] }>(t.request('/api/v1/trash'));
    expect(trash.items).toEqual([expect.objectContaining({ kind: 'person', id: jana.id })]);
    expect((await dav('GET', url)).status).toBe(404);
    // Restored in the app → back in the address book.
    await t.request(`/api/v1/trash/person/${jana.id}/restore`, { method: 'POST' });
    expect((await dav('GET', url)).status).toBe(200);
  });
});
