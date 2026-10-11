import { errorResponseSchema, healthResponseSchema, type HealthResponse } from '@app/shared';
import type { ZodType } from 'zod';

/** Non-2xx API response. `code` is the `error` field of the shared error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter: number | null = null,
  ) {
    super(`${status} ${code}`);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when a request fails with 401 (e.g. the session expired). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
}

export async function api<T>(
  path: string,
  schema: ZodType<T> | null,
  options: RequestOptions = {},
) {
  const res = await fetch(path, {
    method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
    headers: options.json === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    const retryAfter = Number(res.headers.get('retry-after')) || null;
    const error = new ApiError(
      res.status,
      parsed.success ? parsed.data.error : 'unknown',
      retryAfter,
    );
    if (res.status === 401 && !path.startsWith('/api/v1/auth/')) onUnauthorized?.();
    throw error;
  }
  if (res.status === 204 || !schema) return undefined as T;
  return schema.parse(await res.json());
}

export const fetchHealth = (): Promise<HealthResponse> => api('/api/health', healthResponseSchema);
