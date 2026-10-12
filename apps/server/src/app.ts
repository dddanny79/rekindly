import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { API_PREFIX } from '@app/shared';
import { loadSession, requireSession } from './auth/middleware';
import { accountRoutes, protectedAuthRoutes, publicAuthRoutes } from './auth/routes';
import type { AppEnv, Deps } from './env';
import { DomainError } from './lib/errors';
import { healthRoutes } from './health/routes';
import { fieldRoutes } from './catalog/fields';
import { relationshipTypeRoutes } from './catalog/relationship-types';
import { tagRoutes } from './catalog/tags';
import { entryRoutes } from './entries/routes';
import { fileRoutes } from './files/routes';
import { organizationRoutes } from './organizations/routes';
import { peopleRoutes } from './people/routes';
import { reminderRoutes } from './reminders/routes';
import { settingsRoutes } from './settings/routes';
import { spaceRoutes } from './spaces/routes';

export interface AppOptions {
  deps: Deps;
  /** Serve the built web app from this directory if it exists. */
  webDistDir?: string | null;
}

export function createApp({ deps, webDistDir }: AppOptions) {
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.code }, error.status);
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: 'internal_error' }, 500);
  });

  const api = new Hono<AppEnv>();
  api.route('/health', healthRoutes);

  // Versioned API: everything except auth bootstrap needs a session.
  const v1 = new Hono<AppEnv>();
  // Reject cross-site form posts. Allowed: the public origin (behind a TLS proxy the
  // request URL is http) and the request's own origin (local access, dev proxy).
  const publicOrigin = deps.config.publicUrl.origin;
  v1.use(
    csrf({
      origin: (origin, c) => origin === publicOrigin || origin === new URL(c.req.url).origin,
    }),
  );
  v1.use(loadSession(deps));
  v1.route('/auth', publicAuthRoutes(deps));
  v1.use(requireSession);
  v1.route('/auth', protectedAuthRoutes(deps));
  v1.route('/account', accountRoutes(deps));
  v1.route('/settings', settingsRoutes(deps));
  v1.route('/spaces', spaceRoutes(deps));
  v1.route('/people', peopleRoutes(deps));
  v1.route('/organizations', organizationRoutes(deps));
  v1.route('/tags', tagRoutes(deps));
  v1.route('/relationship-types', relationshipTypeRoutes(deps));
  v1.route('/field-definitions', fieldRoutes(deps));
  v1.route('/entries', entryRoutes(deps));
  v1.route('/reminders', reminderRoutes(deps));
  v1.route('/files', fileRoutes(deps));
  api.route('/v1', v1);

  // Catch-all so unknown API paths never fall through to the SPA.
  api.all('*', (c) => c.json({ error: 'not_found' }, 404));
  app.route(API_PREFIX, api);

  if (webDistDir && existsSync(join(webDistDir, 'index.html'))) {
    // serveStatic resolves `root` against the working directory.
    const root = relative(process.cwd(), webDistDir) || '.';
    app.use('*', serveStatic({ root }));
    // SPA fallback: client-side routes get index.html.
    const indexHtml = readFileSync(join(webDistDir, 'index.html'), 'utf8');
    app.get('*', (c) => c.html(indexHtml));
  }

  return app;
}
