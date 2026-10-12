import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { bearerToken, validateApiToken } from '../api-tokens/service';
import type { AppEnv, Deps } from '../env';
import { SESSION_COOKIE, validateSession } from './sessions';

/** Resolves the session cookie into `c.var.session` (or null). */
export const loadSession = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set('session', token ? validateSession(deps.db, token) : null);
    await next();
  });

/** Resolves `Authorization: Bearer <API token>` into `c.var.apiToken` (or null). */
export const loadApiToken = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = bearerToken(c.req.header('authorization'));
    const row = token ? validateApiToken(deps.db, token) : null;
    if (token && !row) return c.json({ error: 'unauthorized' }, 401);
    c.set('apiToken', row);
    await next();
  });

/** 401 unless signed in (session or API token). */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.session && !c.var.apiToken) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

/**
 * What an API token may do: the data (people, organizations, timeline, …), no
 * account, credentials, backups or export; writing only with a write token.
 */
export const TOKEN_PATHS =
  /^\/api\/v1\/(spaces|people|organizations|tags|relationship-types|field-definitions|entries|reminders|files|search|today|duplicates)(\/|$)/;

export const guardApiToken = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.var.apiToken;
  if (!token || c.var.session) return next();
  if (!TOKEN_PATHS.test(c.req.path)) return c.json({ error: 'token_not_allowed' }, 403);
  const reading = c.req.method === 'GET' || c.req.method === 'HEAD';
  if (!reading && token.scope !== 'write') return c.json({ error: 'token_read_only' }, 403);
  await next();
});
