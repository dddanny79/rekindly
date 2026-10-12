import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { APP_NAME } from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { davCards, files, people, spaces } from '../db/schema';
import type { Deps } from '../env';
import { clientIp } from '../lib/client-ip';
import { log } from '../lib/log';
import { notDeleted } from '../lib/sql';
import { RateLimiter } from '../lib/rate-limit';
import { deletePerson } from '../people/service';
import { flushSearchQueue } from '../search/service';
import { verifyAppPassword } from './app-passwords';
import { applyCard } from './inbound';
import { parseVcard, servedVcard } from './vcard';
import {
  type DavResponse,
  DavRequest,
  davError,
  escapeXml,
  multistatus,
  NS,
  prop,
  type PropName,
  propKey,
  type PropValues,
} from './xml';

const ROOT = '/dav/';
const PRINCIPAL = '/dav/principal/';
const HOME = '/dav/addressbooks/';
const BOOK = '/dav/addressbooks/contacts/';
const cardHref = (name: string) => `${BOOK}${encodeURIComponent(name)}.vcf`;

type CardRow = typeof davCards.$inferSelect;

/** The address book one app password sees. */
interface Book {
  appPasswordId: string;
  name: string;
  /** null = all spaces. */
  spaceIds: string[] | null;
}

type DavEnv = { Variables: { book: Book } };

const href = (path: string) => `<d:href>${escapeXml(path)}</d:href>`;
const XML = { 'content-type': 'application/xml; charset=utf-8' };

function maxSeq(db: Db): number {
  return (
    db
      .select({ max: sql<number | null>`max(${davCards.seq})` })
      .from(davCards)
      .get()?.max ?? 0
  );
}

function inBook(book: Book) {
  return book.spaceIds ? inArray(davCards.spaceId, book.spaceIds) : undefined;
}

function liveCards(db: Db, book: Book): CardRow[] {
  return db
    .select()
    .from(davCards)
    .where(and(eq(davCards.deleted, false), inBook(book)))
    .all();
}

function cardByName(db: Db, book: Book, name: string): CardRow | undefined {
  const row = db.select().from(davCards).where(eq(davCards.name, name)).get();
  if (!row || row.deleted) return undefined;
  if (book.spaceIds && !book.spaceIds.includes(row.spaceId)) return undefined;
  return row;
}

/** `/dav/addressbooks/contacts/abc.vcf` (or a full URL) → `abc`. */
function nameFromHref(value: string): string | null {
  let path = value.trim();
  try {
    path = new URL(path, 'http://x').pathname;
  } catch {
    return null;
  }
  if (!path.startsWith(BOOK) || !path.endsWith('.vcf')) return null;
  return decodeURIComponent(path.slice(BOOK.length, -'.vcf'.length)) || null;
}

/** Resource name from the URL; letters, digits and a few separators only. */
const validName = (name: string) => /^[A-Za-z0-9._@+-]{1,200}$/.test(name);

function pick(requested: PropName[] | null, defaults: PropName[], values: Map<string, string>) {
  const result: PropValues = new Map();
  for (const p of requested ?? defaults) {
    result.set(propKey(p), { prop: p, xml: values.get(propKey(p)) });
  }
  return result;
}

const P = {
  resourcetype: prop(NS.dav, 'resourcetype'),
  displayname: prop(NS.dav, 'displayname'),
  currentUserPrincipal: prop(NS.dav, 'current-user-principal'),
  principalUrl: prop(NS.dav, 'principal-URL'),
  owner: prop(NS.dav, 'owner'),
  homeSet: prop(NS.card, 'addressbook-home-set'),
  getctag: prop(NS.cs, 'getctag'),
  syncToken: prop(NS.dav, 'sync-token'),
  supportedReports: prop(NS.dav, 'supported-report-set'),
  privileges: prop(NS.dav, 'current-user-privilege-set'),
  addressData: prop(NS.card, 'address-data'),
  supportedAddressData: prop(NS.card, 'supported-address-data'),
  maxSize: prop(NS.card, 'max-resource-size'),
  description: prop(NS.card, 'addressbook-description'),
  getetag: prop(NS.dav, 'getetag'),
  contentType: prop(NS.dav, 'getcontenttype'),
  lastModified: prop(NS.dav, 'getlastmodified'),
};

const values = (entries: [PropName, string][]) =>
  new Map(entries.map(([p, xml]) => [propKey(p), xml]));

export function davRoutes({ db, config }: Deps) {
  const limiter = new RateLimiter(20, 15 * 60 * 1000);
  const syncTokenUrl = (seq: number) => `${config.publicUrl.origin}/dav/sync/${seq}`;
  const locale = () => (getAccountRow(db)?.locale === 'de' ? 'de' : 'en') as 'de' | 'en';
  const personLink = (personId: string) => ({
    url: `${config.publicUrl.origin}/people/${personId}`,
    label: APP_NAME,
  });

  async function photoOf(fileId: string | null): Promise<Buffer | undefined> {
    if (!fileId) return undefined;
    const row = db.select().from(files).where(eq(files.id, fileId)).get();
    if (!row) return undefined;
    try {
      return await readFile(join(config.dataDir, 'files', row.path));
    } catch {
      return undefined;
    }
  }

  const served = async (card: CardRow) =>
    servedVcard(card.vcard, {
      link: personLink(card.personId),
      photo: await photoOf(card.photoFileId),
    });

  // Property values per resource ---------------------------------------------------

  const principalValues = () => {
    const account = getAccountRow(db);
    return values([
      [P.currentUserPrincipal, href(PRINCIPAL)],
      [P.principalUrl, href(PRINCIPAL)],
      [P.homeSet, href(HOME)],
      [P.displayname, escapeXml(account?.name ?? APP_NAME)],
      [P.owner, href(PRINCIPAL)],
    ]);
  };

  const rootResponse = (requested: PropName[] | null): DavResponse => {
    const v = principalValues();
    v.set(propKey(P.resourcetype), '<d:collection/>');
    return { href: ROOT, props: pick(requested, [P.resourcetype, P.currentUserPrincipal], v) };
  };

  const principalResponse = (requested: PropName[] | null): DavResponse => {
    const v = principalValues();
    v.set(propKey(P.resourcetype), '<d:principal/>');
    return {
      href: PRINCIPAL,
      props: pick(requested, [P.resourcetype, P.displayname, P.homeSet], v),
    };
  };

  const homeResponse = (requested: PropName[] | null): DavResponse => {
    const v = principalValues();
    v.set(propKey(P.resourcetype), '<d:collection/>');
    v.set(propKey(P.displayname), escapeXml(APP_NAME));
    return { href: HOME, props: pick(requested, [P.resourcetype, P.displayname], v) };
  };

  const bookResponse = (book: Book, requested: PropName[] | null): DavResponse => {
    const seq = maxSeq(db);
    const v = principalValues();
    for (const [p, xml] of [
      [P.resourcetype, '<d:collection/><card:addressbook/>'],
      [P.displayname, escapeXml(`${APP_NAME} · ${book.name}`)],
      [P.description, escapeXml(APP_NAME)],
      [P.getctag, String(seq)],
      [P.syncToken, escapeXml(syncTokenUrl(seq))],
      [
        P.supportedReports,
        ['card:addressbook-multiget', 'card:addressbook-query', 'd:sync-collection']
          .map((r) => `<d:supported-report><d:report><${r}/></d:report></d:supported-report>`)
          .join(''),
      ],
      [
        P.privileges,
        [
          'read',
          'write',
          'write-content',
          'write-properties',
          'bind',
          'unbind',
          'read-current-user-privilege-set',
        ]
          .map((p) => `<d:privilege><d:${p}/></d:privilege>`)
          .join(''),
      ],
      [P.supportedAddressData, '<card:address-data-type content-type="text/vcard" version="3.0"/>'],
      [P.maxSize, String(20 * 1024 * 1024)],
    ] as [PropName, string][]) {
      v.set(propKey(p), xml);
    }
    return {
      href: BOOK,
      props: pick(requested, [P.resourcetype, P.displayname, P.getctag, P.syncToken], v),
    };
  };

  const cardResponse = async (
    card: CardRow,
    requested: PropName[] | null,
  ): Promise<DavResponse> => {
    const wantsData = requested?.some((p) => p.name === 'address-data');
    const v = values([
      [P.getetag, escapeXml(`"${card.etag}"`)],
      [P.contentType, 'text/vcard; charset=utf-8'],
      [P.resourcetype, ''],
      [P.lastModified, new Date(card.updatedAt).toUTCString()],
    ]);
    if (wantsData) v.set(propKey(P.addressData), escapeXml(await served(card)));
    return {
      href: cardHref(card.name),
      props: pick(requested, [P.getetag, P.contentType, P.resourcetype], v),
    };
  };

  const davXml = (c: Context, body: string, status = 207) => c.body(body, status as 207, XML);

  // Routes ---------------------------------------------------------------------------

  const dav = new Hono<DavEnv>({ strict: false });

  dav.on('OPTIONS', '*', (c) =>
    c.body(null, 200, {
      DAV: '1, 3, addressbook',
      Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT',
    }),
  );

  // HTTP Basic with an app password (never the login password).
  dav.use('*', async (c, next) => {
    const challenge = () =>
      c.text('Unauthorized', 401, {
        'WWW-Authenticate': 'Basic realm="contacts", charset="UTF-8"',
      });
    const header = c.req.header('authorization');
    if (!header?.toLowerCase().startsWith('basic ')) return challenge();
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return challenge();
    const username = decoded.slice(0, colon);
    const password = decoded.slice(colon + 1);
    const row = verifyAppPassword(db, username, password);
    if (!row) {
      const wait = limiter.hit(clientIp(c, config.trustProxy));
      if (wait) return c.text('Too many attempts', 429, { 'Retry-After': String(wait) });
      log.info(`CardDAV: rejected credentials for "${username}"`);
      return challenge();
    }
    c.set('book', { appPasswordId: row.id, name: row.name, spaceIds: row.spaceIds ?? null });
    // Keep the cards current before every read and after every write.
    flushSearchQueue(db);
    await next();
  });

  const depth = (c: Context) => (c.req.header('depth') ?? '0').trim();

  dav.on('PROPFIND', ['/', ''], async (c) => {
    const req = DavRequest.parse(await c.req.text());
    const responses = [rootResponse(req.props())];
    if (depth(c) !== '0') responses.push(principalResponse(req.props()));
    return davXml(c, multistatus(responses));
  });

  dav.on('PROPFIND', ['/principal', '/principal/'], async (c) => {
    const req = DavRequest.parse(await c.req.text());
    return davXml(c, multistatus([principalResponse(req.props())]));
  });

  dav.on('PROPFIND', ['/addressbooks', '/addressbooks/'], async (c) => {
    const req = DavRequest.parse(await c.req.text());
    const responses = [homeResponse(req.props())];
    if (depth(c) !== '0') responses.push(bookResponse(c.var.book, req.props()));
    return davXml(c, multistatus(responses));
  });

  dav.on('PROPFIND', ['/addressbooks/contacts', '/addressbooks/contacts/'], async (c) => {
    const req = DavRequest.parse(await c.req.text());
    const book = c.var.book;
    const responses: DavResponse[] = [bookResponse(book, req.props())];
    if (depth(c) !== '0') {
      for (const card of liveCards(db, book)) responses.push(await cardResponse(card, req.props()));
    }
    return davXml(c, multistatus(responses));
  });

  dav.on('REPORT', ['/addressbooks/contacts', '/addressbooks/contacts/'], async (c) => {
    const req = DavRequest.parse(await c.req.text());
    const book = c.var.book;
    const requested = req.props();
    if (req.kind === 'addressbook-multiget') {
      const responses: DavResponse[] = [];
      for (const value of req.hrefs()) {
        const name = nameFromHref(value);
        const card = name ? cardByName(db, book, name) : undefined;
        responses.push(
          card ? await cardResponse(card, requested) : { href: value, status: '404 Not Found' },
        );
      }
      return davXml(c, multistatus(responses));
    }
    if (req.kind === 'sync-collection') {
      const token = req.syncToken();
      const current = maxSeq(db);
      let since = 0;
      if (token) {
        const match = /(\d+)$/.exec(token);
        since = match ? Number(match[1]) : -1;
        if (since < 0 || since > current) return davXml(c, davError('valid-sync-token'), 403);
      }
      const rows = token
        ? db.select().from(davCards).where(gt(davCards.seq, since)).all()
        : liveCards(db, book);
      const responses: DavResponse[] = [];
      for (const card of rows) {
        const visible = !card.deleted && (!book.spaceIds || book.spaceIds.includes(card.spaceId));
        if (visible) responses.push(await cardResponse(card, requested));
        else if (token) responses.push({ href: cardHref(card.name), status: '404 Not Found' });
      }
      return davXml(c, multistatus(responses, syncTokenUrl(current)));
    }
    if (req.kind === 'addressbook-query') {
      // Filters are not supported; every card is returned (clients filter themselves).
      const responses: DavResponse[] = [];
      for (const card of liveCards(db, book)) responses.push(await cardResponse(card, requested));
      return davXml(c, multistatus(responses));
    }
    return davXml(c, davError('supported-report'), 403);
  });

  // Single cards -------------------------------------------------------------------

  const cardName = (c: Context) => {
    const file = c.req.param('file') ?? '';
    return file.endsWith('.vcf') ? decodeURIComponent(file.slice(0, -4)) : null;
  };
  const etagMatches = (header: string | undefined, etag: string) =>
    !header ||
    header.split(',').some((h) => h.trim().replace(/^W\//, '') === `"${etag}"` || h.trim() === '*');

  dav.on('PROPFIND', '/addressbooks/contacts/:file', async (c) => {
    const name = cardName(c);
    const card = name ? cardByName(db, c.var.book, name) : undefined;
    if (!card) return c.text('Not Found', 404);
    const req = DavRequest.parse(await c.req.text());
    return davXml(c, multistatus([await cardResponse(card, req.props())]));
  });

  dav.on(['GET', 'HEAD'], '/addressbooks/contacts/:file', async (c) => {
    const name = cardName(c);
    const card = name ? cardByName(db, c.var.book, name) : undefined;
    if (!card) return c.text('Not Found', 404);
    return c.body(await served(card), 200, {
      'content-type': 'text/vcard; charset=utf-8',
      etag: `"${card.etag}"`,
    });
  });

  dav.put(
    '/addressbooks/contacts/:file',
    bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.text('Too large', 413) }),
    async (c) => {
      const name = cardName(c);
      if (!name || !validName(name)) return c.text('Bad resource name', 400);
      const book = c.var.book;
      const card = cardByName(db, book, name);
      if (card && c.req.header('if-none-match')?.trim() === '*') return c.text('Exists', 412);
      if (card && !etagMatches(c.req.header('if-match'), card.etag)) return c.text('Changed', 412);
      if (!card && c.req.header('if-match')) return c.text('Gone', 412);

      const parsed = parseVcard(await c.req.text(), {
        locale: locale(),
        isOwnLink: (url) => url.startsWith(`${config.publicUrl.origin}/people/`),
      });
      if (card) {
        const person = db.select().from(people).where(eq(people.id, card.personId)).get()!;
        await applyCard(db, {
          personId: person.id,
          spaceId: person.spaceId,
          card: parsed,
          locale: locale(),
          dataDir: config.dataDir,
        });
        flushSearchQueue(db);
        return c.body(null, 204);
      }
      // A new card from the client: it keeps its resource name and UID.
      const spaceId =
        book.spaceIds?.[0] ??
        db
          .select({ id: spaces.id })
          .from(spaces)
          .where(notDeleted(spaces))
          .orderBy(spaces.sort)
          .get()?.id;
      if (!spaceId) return c.text('No space', 409);
      db.delete(davCards).where(eq(davCards.name, name)).run(); // an old tombstone
      const personId = await applyCard(db, {
        spaceId,
        card: parsed,
        locale: locale(),
        dataDir: config.dataDir,
      });
      db.insert(davCards)
        .values({
          personId,
          name,
          uid: parsed.uid ?? personId,
          spaceId,
          etag: '',
          vcard: '',
          seq: 0,
        })
        .onConflictDoUpdate({
          target: davCards.personId,
          set: { name, uid: parsed.uid ?? personId },
        })
        .run();
      flushSearchQueue(db);
      return c.body(null, 201);
    },
  );

  dav.delete('/addressbooks/contacts/:file', async (c) => {
    const name = cardName(c);
    const card = name ? cardByName(db, c.var.book, name) : undefined;
    if (!card) return c.text('Not Found', 404);
    if (!etagMatches(c.req.header('if-match'), card.etag)) return c.text('Changed', 412);
    // Defensive: a delete on a phone moves the person to the trash (30 days).
    deletePerson(db, card.personId);
    flushSearchQueue(db);
    return c.body(null, 204);
  });

  return dav;
}

/** `/.well-known/carddav` and a PROPFIND on `/` lead clients to the DAV root. */
export function davDiscovery() {
  return new Hono()
    .all('/.well-known/carddav', (c) => c.redirect(ROOT, 301))
    .on('PROPFIND', '/', (c) => c.redirect(ROOT, 301));
}
