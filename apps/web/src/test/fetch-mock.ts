import { vi } from 'vitest';
import type { AuthStatusResponse } from '@app/shared';

export const SIGNED_IN: AuthStatusResponse = {
  setupRequired: false,
  authenticated: true,
  account: { name: 'Erika Musterfrau', email: 'erika@example.com', locale: 'en' },
  passkeysEnabled: false,
};
export const SIGNED_OUT: AuthStatusResponse = {
  setupRequired: false,
  authenticated: false,
  account: null,
  passkeysEnabled: false,
};
export const FRESH: AuthStatusResponse = {
  setupRequired: true,
  authenticated: false,
  account: null,
  passkeysEnabled: false,
};

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Stubs fetch with per-route handlers ("METHOD /path"); unknown routes answer 404. */
export function mockApi(status: AuthStatusResponse, routes: Record<string, Handler> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    const key = `${init?.method ?? 'GET'} ${path}`;
    if (routes[key]) return routes[key](init);
    if (key === 'GET /api/v1/auth/status') return Response.json(status);
    if (key === 'GET /api/health') return Response.json({ status: 'ok', version: '0.0.0-test' });
    if (key === 'GET /api/v1/auth/passkeys') return Response.json({ passkeys: [] });
    if (key === 'GET /api/v1/settings') {
      return Response.json({ passkeysEnabled: status.passkeysEnabled });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
