import { errorResponseSchema, healthResponseSchema, type HealthResponse } from '@app/shared';
import type { ZodType } from 'zod';

/** Non-2xx API response. `code` is the `error` field of the shared error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter: number | null = null,
    /** Technical detail from the server, if any. */
    readonly detail: string | null = null,
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
  /** Multipart body (file uploads). */
  form?: FormData;
  /** Cancels the request (e.g. a search that was overtaken by the next keystroke). */
  signal?: AbortSignal;
}

export async function api<T>(
  path: string,
  schema: ZodType<T> | null,
  options: RequestOptions = {},
) {
  const res = await fetch(path, {
    method: options.method ?? (options.json === undefined && !options.form ? 'GET' : 'POST'),
    headers: options.json === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)),
    credentials: 'same-origin',
    signal: options.signal,
  });
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    const retryAfter = Number(res.headers.get('retry-after')) || null;
    const error = new ApiError(
      res.status,
      parsed.success ? parsed.data.error : 'unknown',
      retryAfter,
      parsed.success ? (parsed.data.detail ?? null) : null,
    );
    if (res.status === 401 && !path.startsWith('/api/v1/auth/')) onUnauthorized?.();
    throw error;
  }
  if (res.status === 204 || !schema) return undefined as T;
  return schema.parse(await res.json());
}

export const fetchHealth = (): Promise<HealthResponse> => api('/api/health', healthResponseSchema);
