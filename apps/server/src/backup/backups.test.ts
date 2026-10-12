import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { BackupSettings, BackupStatus, Person, TodayResponse } from '@app/shared';
import { createSignedInApp } from '../test/helpers';
import { backupDue } from './backups';
import { isBackupFile } from './crypto';

type App = Awaited<ReturnType<typeof createSignedInApp>>;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

async function app() {
  const t = await createSignedInApp();
  cleanups.push(() => t.cleanup());
  return t;
}

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A tiny WebDAV server (Basic auth "backup:secret", one folder /dav/backups/). */
async function webdavServer() {
  const files = new Map<string, Buffer>();
  let folder = false;
  const server = createServer(async (req, res) => {
    const data = await body(req);
    if (req.headers.authorization !== `Basic ${Buffer.from('backup:secret').toString('base64')}`) {
      res.writeHead(401).end();
      return;
    }
    const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    const name = path.replace('/dav/backups/', '');
    if (req.method === 'MKCOL') {
      folder = true;
      res.writeHead(201).end();
    } else if (req.method === 'PUT') {
      if (!folder) return void res.writeHead(409).end();
      files.set(name, data);
      res.writeHead(201).end();
    } else if (req.method === 'PROPFIND') {
      if (!folder) return void res.writeHead(404).end();
      const items = [...files].map(
        ([n, d]) =>
          `<d:response><d:href>/dav/backups/${encodeURIComponent(n)}</d:href><d:propstat><d:prop><d:getcontentlength>${d.length}</d:getcontentlength><d:getlastmodified>Mon, 12 Oct 2026 01:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>`,
      );
      res
        .writeHead(207, { 'content-type': 'application/xml' })
        .end(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/backups/</d:href></d:response>${items.join('')}</d:multistatus>`,
        );
    } else if (req.method === 'GET') {
      const file = files.get(name);
      if (!file) return void res.writeHead(404).end();
      res.writeHead(200).end(file);
    } else if (req.method === 'DELETE') {
      files.delete(name);
      res.writeHead(204).end();
    } else res.writeHead(405).end();
  });
  const origin = await listen(server);
  return { url: `${origin}/dav/backups/`, files };
}

/** A tiny S3 server (path style, bucket "b"); only checks that requests are signed. */
async function s3Server() {
  const objects = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    const data = await body(req);
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDTEST/') || !req.headers['x-amz-date']) {
      return void res.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>');
    }
    const url = new URL(req.url!, 'http://x');
    const key = decodeURIComponent(url.pathname.replace(/^\/b\/?/, ''));
    if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const contents = [...objects]
        .filter(([k]) => k.startsWith(prefix))
        .map(
          ([k, d]) =>
            `<Contents><Key>${k}</Key><Size>${d.length}</Size><LastModified>2026-10-12T01:00:00.000Z</LastModified></Contents>`,
        );
      return void res
        .writeHead(200, { 'content-type': 'application/xml' })
        .end(
          `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents.join('')}</ListBucketResult>`,
        );
    }
    if (req.method === 'PUT') {
      objects.set(key, data);
      return void res.writeHead(200).end();
    }
    if (req.method === 'GET') {
      const object = objects.get(key);
      return void (object ? res.writeHead(200).end(object) : res.writeHead(404).end());
    }
    if (req.method === 'DELETE') {
      objects.delete(key);
      return void res.writeHead(204).end();
    }
    res.writeHead(405).end();
  });
  return { endpoint: await listen(server), objects };
}

const PASSPHRASE = 'lange genug und geheim';

async function configure(
  t: App,
  target: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return t.json<BackupSettings>(
    t.request('/api/v1/backup', {
      method: 'PUT',
      json: { enabled: true, hour: 3, keep: 14, passphrase: PASSPHRASE, ...target, ...extra },
    }),
  );
}

async function filled() {
  const t = await app();
  const spaces = await t.json<{ spaces: { id: string }[] }>(t.request('/api/v1/spaces'));
  await t.json<Person>(
    t.request('/api/v1/people', {
      method: 'POST',
      json: { spaceId: spaces.spaces[0]!.id, firstName: 'Jana', lastName: 'Geheim' },
    }),
    201,
  );
  return t;
}

describe('automatic backups', () => {
  it('backs up to WebDAV, encrypted, keeps only the newest and restores (acceptance)', async () => {
    const dav = await webdavServer();
    const source = await filled();
    const settings = await configure(source, {
      kind: 'webdav',
      webdav: { url: dav.url, username: 'backup', password: 'secret' },
    });
    expect(settings).toMatchObject({ configured: true, enabled: true, hasPassphrase: true });
    expect(JSON.stringify(settings)).not.toContain('secret');
    expect((await source.request('/api/v1/backup/test', { method: 'POST' })).status).toBe(204);

    // Two older backups (named before the rename) at the target; with keep = 2 only the
    // newest two remain, whatever the prefix.
    dav.files.set('personengedaechtnis-2026-01-01T03-00-00Z.backup', Buffer.from('old'));
    dav.files.set('personengedaechtnis-2026-01-02T03-00-00Z.backup', Buffer.from('old'));
    await configure(
      source,
      { kind: 'webdav', webdav: { url: dav.url, username: 'backup' } },
      { keep: 2 },
    );
    const status = await source.json<BackupStatus>(
      source.request('/api/v1/backup/run', { method: 'POST' }),
    );
    expect(status.lastError).toBeNull();
    expect(status.lastFile).toMatch(/^rekindly-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.backup$/);
    expect([...dav.files.keys()].sort()).toEqual(
      [status.lastFile!, 'personengedaechtnis-2026-01-02T03-00-00Z.backup'].sort(),
    );
    const file = dav.files.get(status.lastFile!)!;
    expect(isBackupFile(file)).toBe(true);
    expect(file.includes(Buffer.from('Geheim'))).toBe(false);

    // Restore into a new, empty instance from the target.
    const target = await app();
    await configure(target, {
      kind: 'webdav',
      webdav: { url: dav.url, username: 'backup', password: 'secret' },
    });
    const { files } = await target.json<{ files: { name: string }[] }>(
      target.request('/api/v1/backup/files'),
    );
    expect(files[0]!.name).toBe(status.lastFile);
    const wrong = await target.request('/api/v1/backup/restore', {
      method: 'POST',
      json: { name: status.lastFile, passphrase: 'falsch falsch' },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'wrong_passphrase' });
    const restored = await target.json<{ imported: { people: number } }>(
      target.request('/api/v1/backup/restore', {
        method: 'POST',
        json: { name: status.lastFile, passphrase: PASSPHRASE },
      }),
    );
    expect(restored.imported.people).toBe(1);
    const { people } = await target.json<{ people: { displayName: string }[] }>(
      target.request('/api/v1/people'),
    );
    expect(people.map((p) => p.displayName)).toEqual(['Jana Geheim']);
    // The restored instance keeps its own backup configuration.
    expect((await target.json<BackupSettings>(target.request('/api/v1/backup'))).configured).toBe(
      true,
    );
  });

  it('backs up to S3 and restores an uploaded backup file with its password', async () => {
    const s3 = await s3Server();
    const source = await filled();
    await configure(source, {
      kind: 's3',
      s3: {
        endpoint: s3.endpoint,
        region: 'eu-central',
        bucket: 'b',
        prefix: 'pg/',
        accessKeyId: 'AKIDTEST',
        secretAccessKey: 'shh',
      },
    });
    const status = await source.json<BackupStatus>(
      source.request('/api/v1/backup/run', { method: 'POST' }),
    );
    expect(status.lastError).toBeNull();
    const key = `pg/${status.lastFile}`;
    expect([...s3.objects.keys()]).toEqual([key]);

    const target = await app();
    const upload = (passphrase: string) =>
      target.request('/api/v1/import', {
        method: 'POST',
        body: new Uint8Array(s3.objects.get(key)!),
        headers: {
          'content-type': 'application/octet-stream',
          'x-backup-passphrase': encodeURIComponent(passphrase),
        },
      });
    expect((await upload('falsch falsch')).status).toBe(400);
    const res = await upload(PASSPHRASE);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { imported: { people: number } }).imported.people).toBe(1);
  });

  it('shows a failed backup on the Today page and keeps credentials out of exports', async () => {
    const t = await filled();
    await configure(t, {
      kind: 'webdav',
      webdav: { url: 'http://127.0.0.1:9/nowhere/', username: 'x', password: 'y' },
    });
    const test = await t.request('/api/v1/backup/test', { method: 'POST' });
    expect(test.status).toBe(502);
    expect(await test.json()).toMatchObject({
      error: 'backup_target_failed',
      detail: expect.any(String),
    });
    const status = await t.json<BackupStatus>(t.request('/api/v1/backup/run', { method: 'POST' }));
    expect(status.lastError).toBeTruthy();
    const today = await t.json<TodayResponse>(t.request('/api/v1/today'));
    expect(today.backup).toMatchObject({ state: 'failed' });

    const exported = await t.json<{ data: { settings: { key: string }[] } }>(
      t.request('/api/v1/export/json'),
    );
    expect(exported.data.settings.map((s) => s.key)).not.toContain('backup.config');
    expect(JSON.stringify(exported)).not.toContain('nowhere');
  });

  it('requires a backup password and a target', async () => {
    const t = await app();
    const put = (json: unknown) => t.request('/api/v1/backup', { method: 'PUT', json });
    const base = { enabled: true, kind: 'webdav', hour: 3, keep: 14 };
    expect(
      (await put({ ...base, webdav: { url: 'http://x/', username: 'a', password: 'b' } })).status,
    ).toBe(400);
    expect((await put({ ...base, passphrase: PASSPHRASE })).status).toBe(400);
    expect(
      (
        await put({
          ...base,
          passphrase: 'kurz',
          webdav: { url: 'http://x/', username: 'a', password: 'b' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('backupDue', () => {
  const status = (patch: Partial<BackupStatus> = {}): BackupStatus => ({
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    lastFile: null,
    lastSize: null,
    ...patch,
  });
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);

  it('runs once a day from the set hour and retries failures hourly', () => {
    const config = { enabled: true, hour: 3 };
    expect(backupDue(config, status(), at(2, 50))).toBe(false);
    expect(backupDue(config, status(), at(3, 5))).toBe(true);
    expect(backupDue({ ...config, enabled: false }, status(), at(4))).toBe(false);
    expect(
      backupDue(
        config,
        status({ lastSuccessAt: at(3, 1).toISOString(), lastRunAt: at(3).toISOString() }),
        at(23),
      ),
    ).toBe(false);
    // Yesterday's backup: due again today.
    expect(
      backupDue(
        config,
        status({
          lastSuccessAt: new Date(2026, 9, 11, 3).toISOString(),
          lastRunAt: new Date(2026, 9, 11, 3).toISOString(),
        }),
        at(3, 5),
      ),
    ).toBe(true);
    // Failed 20 minutes ago: wait; an hour later: retry.
    const failed = status({ lastRunAt: at(3).toISOString(), lastErrorAt: at(3).toISOString() });
    expect(backupDue(config, failed, at(3, 20))).toBe(false);
    expect(backupDue(config, failed, at(4, 5))).toBe(true);
  });
});
