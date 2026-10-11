import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Expected failure with an API error code; turned into JSON by the app's error handler. */
export class DomainError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
  ) {
    super(code);
  }
}

export const notFound = () => new DomainError(404, 'not_found');
