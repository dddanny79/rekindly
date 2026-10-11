import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('createApp', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await createApp().request('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('does not serve a frontend when no build exists', async () => {
    const res = await createApp({ webDistDir: '/nonexistent' }).request('/');
    expect(res.status).toBe(404);
  });

  describe('with a built frontend', () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'web-dist-'));
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>shell</title>');
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1);');
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('serves index.html at /', async () => {
      const res = await createApp({ webDistDir: dir }).request('/');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<title>shell</title>');
    });

    it('serves static assets', async () => {
      const res = await createApp({ webDistDir: dir }).request('/assets/app.js');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('console.log(1);');
    });

    it('falls back to index.html for client-side routes', async () => {
      const res = await createApp({ webDistDir: dir }).request('/people/123');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<title>shell</title>');
    });

    it('keeps API 404s as JSON', async () => {
      const res = await createApp({ webDistDir: dir }).request('/api/nope');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    });
  });
});
