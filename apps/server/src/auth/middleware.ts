import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { AppEnv, Deps } from '../env';
import { SESSION_COOKIE, validateSession } from './sessions';

/** Resolves the session cookie into `c.var.session` (or null). */
export const loadSession = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set('session', token ? validateSession(deps.db, token) : null);
    await next();
  });

/** 401 unless signed in. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.session) return c.json({ error: 'unauthorized' }, 401);
  await next();
});
