import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyCredentials } from './auth/account';
import { sessions } from './db/schema';
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
