import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { API_PREFIX } from '@app/shared';
import { healthRoutes } from './health/routes';

export interface AppOptions {
  /** Serve the built web app from this directory if it exists. */
  webDistDir?: string | null;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono();

  const api = new Hono();
  api.route('/health', healthRoutes);
  // Catch-all so unknown API paths never fall through to the SPA.
  api.all('*', (c) => c.json({ error: 'not_found' }, 404));
  app.route(API_PREFIX, api);

  const { webDistDir } = options;
  if (webDistDir && existsSync(join(webDistDir, 'index.html'))) {
    // serveStatic resolves `root` against the working directory.
    const root = relative(process.cwd(), webDistDir) || '.';
    app.use('*', serveStatic({ root }));
    // SPA fallback: client-side routes get index.html.
    const indexHtml = readFile(join(webDistDir, 'index.html'), 'utf8');
    app.get('*', async (c) => c.html(await indexHtml));
  }

  return app;
}
