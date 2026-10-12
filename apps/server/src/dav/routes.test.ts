import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateAppPasswordResponse, Entry, Person, TrashItem } from '@app/shared';
import { createSignedInApp, OWNER } from '../test/helpers';
import { unfold } from './vcard';

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
    expect(entries[0]).toMatchObject({ kind: 'note', title: 'Über Sync geändert' });
    expect(entries[0]!.bodyMd).toContain('Telefon hinzugefügt: +49 170 2');
    expect(entries[0]!.bodyMd).toContain('Telefon in den Papierkorb: +49 170 1');

    // The unknown anniversary line survives the round trip.
    const back = unfold(await (await dav('GET', url)).text());
    expect(back).toContain('extra1.X-ABDATE:2019-05-01');
    expect(back).toContain('extra1.X-ABLabel:_$!<Anniversary>!$_');
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
