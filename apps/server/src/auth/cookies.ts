import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { SESSION_COOKIE, SESSION_TTL_MS } from './sessions';

export function setSessionCookie(c: Context, token: string, publicUrl: URL) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: publicUrl.protocol === 'https:',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
