import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/helpers';
import { OPERATIONS, openApiPath } from './spec';

const apps: ReturnType<typeof createTestApp>[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.cleanup()));

describe('OpenAPI', () => {
  it('describes every route of the API, and nothing else', () => {
    const t = createTestApp();
    apps.push(t);
    const routes = new Set(
      t.app.routes
        .filter(
          (r) =>
            r.method !== 'ALL' &&
            r.path.startsWith('/api/') &&
            !['/api/openapi.json', '/api/docs'].includes(r.path),
        )
        .map((r) => `${r.method} ${r.path}`),
    );
    const documented = new Set(OPERATIONS.map((o) => `${o.method.toUpperCase()} ${o.path}`));
    expect([...routes].filter((r) => !documented.has(r))).toEqual([]);
    expect([...documented].filter((r) => !routes.has(r))).toEqual([]);
  });

  it('serves the document and the docs page without sign-in', async () => {
    const t = createTestApp();
    apps.push(t);
    const res = await t.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, { 'x-api-token': string; requestBody?: unknown }>>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/api/v1/people/{id}']!.get!['x-api-token']).toBe('read');
    expect(doc.paths['/api/v1/people']!.post!['x-api-token']).toBe('write');
    expect(doc.paths['/api/v1/account']!.get!['x-api-token']).toBe('session only');
    expect(doc.paths['/api/v1/people']!.post!.requestBody).toBeTruthy();

    const page = await t.request('/api/docs');
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    for (const o of OPERATIONS) expect(html).toContain(openApiPath(o.path).replace(/&/g, '&amp;'));
    // Self-contained: no scripts, nothing loaded from elsewhere.
    expect(html).not.toMatch(/<script|(src|href)="https?:/);
  });
});
