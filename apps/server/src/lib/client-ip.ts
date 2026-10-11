import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/** Client address; X-Forwarded-For is only trusted behind a configured reverse proxy. */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // Not running on the Node adapter (e.g. app.request() in tests).
    return 'unknown';
  }
}
