import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Expected failure with an API error code; turned into JSON by the app's error handler. */
export class DomainError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    /** Optional technical detail shown with the message (e.g. a backup target's answer). */
    readonly detail?: string,
  ) {
    super(code);
  }
}

export const notFound = () => new DomainError(404, 'not_found');
