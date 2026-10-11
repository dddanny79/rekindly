import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app';
import { createDb, runMigrations } from '../db/client';
import { seed } from '../db/seed';
import { createDeps } from '../deps';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));
export const TEST_PUBLIC_URL = new URL('http://localhost:3000');

/** App against a fresh, migrated SQLite file in a temp directory. */
export function createTestApp(options: { webDistDir?: string | null } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'app-test-'));
  const { db, sqlite } = createDb(dataDir);
  runMigrations(db, MIGRATIONS_DIR);
  seed(db);
  const deps = createDeps(db, { publicUrl: TEST_PUBLIC_URL, trustProxy: false, dataDir });
  const app = createApp({ deps, webDistDir: options.webDistDir ?? null });

  let cookie: string | null = null;

  /** Request with a simple cookie jar for the session cookie. */
  async function request(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    // Browsers send Origin on same-origin POST/PUT/PATCH/DELETE.
    if (!headers.has('origin')) headers.set('origin', 'http://localhost');
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    const res = await app.request(path, { ...init, headers, body });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      cookie = pair && !/=$/.test(pair) && !/Max-Age=0/i.test(setCookie) ? pair : null;
    }
    return res;
  }

  return {
    app,
    db,
    deps,
    dataDir,
    request,
    clearCookies: () => {
      cookie = null;
    },
    setCookie: (value: string | null) => {
      cookie = value;
    },
    getCookie: () => cookie,
    cleanup: () => {
      sqlite.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export type TestApp = ReturnType<typeof createTestApp>;

export const OWNER = {
  name: 'Erika Musterfrau',
  email: 'erika@example.com',
  password: 'correct horse battery staple',
  locale: 'de' as const,
};

export async function setupOwner(t: TestApp) {
  const res = await t.request('/api/v1/auth/setup', { method: 'POST', json: OWNER });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
  return res;
}

/** Signed-in app with ids of the seeded spaces and relationship types. */
export async function createSignedInApp() {
  const t = createTestApp();
  await setupOwner(t);
  const json = async <T>(res: Response | Promise<Response>, status = 200): Promise<T> => {
    const r = await res;
    if (r.status !== status) {
      throw new Error(`expected ${status}, got ${r.status}: ${await r.text()}`);
    }
    return (await r.json()) as T;
  };
  const { spaces } = await json<{ spaces: { id: string; nameKey: string | null }[] }>(
    t.request('/api/v1/spaces'),
  );
  const { relationshipTypes } = await json<{
    relationshipTypes: { id: string; nameKey: string | null }[];
  }>(t.request('/api/v1/relationship-types'));
  const spaceId = (key: string) => spaces.find((s) => s.nameKey === `seed.spaces.${key}`)!.id;
  const typeId = (key: string) =>
    relationshipTypes.find((r) => r.nameKey === `seed.relationshipTypes.${key}`)!.id;
  return {
    ...t,
    json,
    privateSpace: spaceId('private'),
    businessSpace: spaceId('business'),
    typeId,
  };
}
