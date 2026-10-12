import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { API_PREFIX } from '@app/shared';
import { guardApiToken, loadApiToken, loadSession, requireSession } from './auth/middleware';
import { accountRoutes, protectedAuthRoutes, publicAuthRoutes } from './auth/routes';
import type { AppEnv, Deps } from './env';
import { DomainError } from './lib/errors';
import { log } from './lib/log';
import { healthRoutes } from './health/routes';
import { fieldRoutes } from './catalog/fields';
import { relationshipTypeRoutes } from './catalog/relationship-types';
import { tagRoutes } from './catalog/tags';
import { backupConfigRoutes } from './backup/backup-routes';
import { backupRoutes } from './backup/routes';
import { calendarFeedRoutes, calendarSubscriptionRoutes } from './calendar/feeds';
import { appPasswordRoutes } from './dav/app-passwords';
import { davDiscovery, davRoutes } from './dav/routes';
import { entryRoutes } from './entries/routes';
import { fileRoutes } from './files/routes';
import { organizationRoutes } from './organizations/routes';
import { peopleRoutes } from './people/routes';
import { reminderRoutes } from './reminders/routes';
import { searchRoutes } from './search/routes';
import { todayRoutes } from './today/routes';
import { trashRoutes } from './trash/routes';
import { contactImportRoutes } from './contact-imports/routes';
import { duplicateRoutes } from './duplicates/routes';
import { apiTokenRoutes } from './api-tokens/routes';
import { aiRoutes } from './ai/routes';
import { mcpRoutes } from './mcp/routes';
import { docsHtml } from './openapi/docs';
import { openApiDocument } from './openapi/spec';
import { flushSearchQueue } from './search/service';
import { settingsRoutes } from './settings/routes';
import { spaceRoutes } from './spaces/routes';

export interface AppOptions {
  deps: Deps;
  /** Serve the built web app from this directory if it exists. */
  webDistDir?: string | null;
}

export function createApp({ deps, webDistDir }: AppOptions) {
  // Not strict: DAV clients use collection URLs with and without a trailing slash.
  const app = new Hono<AppEnv>({ strict: false });

  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return c.json(
        { error: error.code, ...(error.detail ? { detail: error.detail } : {}) },
        error.status,
      );
    }
    if (error instanceof HTTPException) return error.getResponse();
    log.error(`${c.req.method} ${new URL(c.req.url).pathname} failed`, error);
    return c.json({ error: 'internal_error' }, 500);
  });

  // LOG_LEVEL=debug: one line per request.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    log.debug(
      `${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${Math.round(performance.now() - started)} ms`,
    );
  });

  const api = new Hono<AppEnv>();
  api.route('/health', healthRoutes);
  // API description: OpenAPI document and a readable page (no data, so no sign-in).
  const openApi = openApiDocument(deps.config.publicUrl);
  api.get('/openapi.json', (c) => c.json(openApi));
  const docs = docsHtml(openApi);
  api.get('/docs', (c) => c.html(docs));

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
  v1.use(loadApiToken(deps));
  v1.route('/auth', publicAuthRoutes(deps));
  v1.use(requireSession);
  v1.use(guardApiToken);
  // Keep the search index current: rebuild what the write just changed.
  v1.use(async (c, next) => {
    await next();
    if (c.req.method === 'GET') return;
    try {
      flushSearchQueue(deps.db);
    } catch (error) {
      // The queue stays filled and is retried with the next search.
      log.error('search index update failed', error);
    }
  });
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
  v1.route('/search', searchRoutes(deps));
  v1.route('/today', todayRoutes(deps));
  v1.route('/trash', trashRoutes(deps));
  v1.route('/app-passwords', appPasswordRoutes(deps));
  v1.route('/calendar-feeds', calendarFeedRoutes(deps));
  v1.route('/backup', backupConfigRoutes(deps));
  v1.route('/contact-imports', contactImportRoutes(deps));
  v1.route('/duplicates', duplicateRoutes(deps));
  v1.route('/api-tokens', apiTokenRoutes(deps));
  v1.route('/ai', aiRoutes(deps));
  v1.route('/', backupRoutes(deps));
  api.route('/v1', v1);

  // Catch-all so unknown API paths never fall through to the SPA.
  api.all('*', (c) => c.json({ error: 'not_found' }, 404));
  app.route(API_PREFIX, api);

  // CardDAV for address books (iPhone, DAVx5 …), authenticated with app passwords.
  app.route('/dav', davRoutes(deps));
  // MCP server for AI assistants (Claude Code, Claude Desktop), API-token auth.
  app.route('/mcp', mcpRoutes(deps));
  // Calendar subscriptions (ICS); the secret link is the key.
  app.route('/ics', calendarSubscriptionRoutes(deps));
  app.route('/', davDiscovery());

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
