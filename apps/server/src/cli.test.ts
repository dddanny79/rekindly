import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyCredentials } from './auth/account';
import { people, sessions, spaces } from './db/schema';
import { searchDocumentCount } from './search/service';
import { createTestApp, OWNER, setupOwner, type TestApp } from './test/helpers';

const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));
const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.cleanup());

const run = (input: string) =>
  spawnSync(TSX, [CLI, 'reset-password'], {
    input,
    env: { ...process.env, DATA_DIR: t.dataDir },
    encoding: 'utf8',
  });

describe('cli reset-password', () => {
  it('sets a new password from stdin and signs out all sessions', async () => {
    await setupOwner(t);
    expect(t.db.select().from(sessions).all()).toHaveLength(1);

    const result = run('a new emergency password\n');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Password changed');

    expect(await verifyCredentials(t.db, OWNER.email, 'a new emergency password')).toBe(true);
    expect(await verifyCredentials(t.db, OWNER.email, OWNER.password)).toBe(false);
    expect(t.db.select().from(sessions).all()).toHaveLength(0);
  }, 20_000);

  it('rejects a short password', async () => {
    await setupOwner(t);
    const result = run('short\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('at least 12 characters');
    expect(await verifyCredentials(t.db, OWNER.email, OWNER.password)).toBe(true);
  }, 20_000);

  it('explains when there is no account yet', () => {
    const result = run('whatever password\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No account exists yet');
  }, 20_000);

  it('prints usage for unknown commands', () => {
    const out = execFileSync(TSX, [CLI, '--help'], { encoding: 'utf8' });
    expect(out).toContain('reset-password');
  }, 20_000);
});

describe('cli reindex', () => {
  it('rebuilds the search index', async () => {
    await setupOwner(t);
    const spaceId = t.db.select().from(spaces).all()[0]!.id;
    t.db.insert(people).values({ spaceId, firstName: 'Ida', lastName: 'Index' }).run();
    const out = execFileSync(TSX, [CLI, 'reindex'], {
      env: { ...process.env, DATA_DIR: t.dataDir },
      encoding: 'utf8',
    });
    expect(out).toContain('Search index rebuilt: 1 people, 0 organizations');
    expect(searchDocumentCount(t.db, 'person')).toBe(1);
  }, 20_000);
});

describe('cli backup', () => {
  it('writes a consistent copy of the database and refuses to overwrite', async () => {
    await setupOwner(t);
    const file = join(t.dataDir, 'backups', 'test.sqlite');
    const run = () =>
      spawnSync(TSX, [CLI, 'backup', file], {
        env: { ...process.env, DATA_DIR: t.dataDir },
        encoding: 'utf8',
      });
    const first = run();
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`Database backed up to ${file}`);
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('select email from account').get()).toEqual({ email: OWNER.email });
    copy.close();
    const second = run();
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('already exists');
  }, 20_000);
});
