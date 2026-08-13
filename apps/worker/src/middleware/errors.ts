import type { Context } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export type ErrorVariables = RequestIdVariables & { userId?: string };

// Typed 4xx (or other non-500) error a route can throw to get the standard
// envelope back with its own status/code/message instead of falling through to
// onError's generic 500 -- see docs/api.md's error envelope + status code table.
// `meta` is optional, additional structured detail -- e.g. `usage_limit_exceeded`'s
// `{ limit, used, resets_at }` (docs/api.md's cross-cutting rules). `headers` is
// optional response headers -- e.g. a 429's `Retry-After` (docs/api.md: "Rate-limited
// -> always 429 with Retry-After").
export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public meta?: Record<string, unknown>,
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Global catch-all for anything a route doesn't handle itself: never leak a raw
// stack trace to the client, but keep it (plus route/user context) in the
// server-side log line so an incident is debuggable from logs alone.
//
// Generic over the app's full Env (not just Variables) so this is assignable to
// `app.onError` regardless of what Bindings the app declares.
export const onError = <E extends { Variables: ErrorVariables }>(err: Error, c: Context<E>) => {
  const correlationId = c.get('requestId');

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          correlationId,
          ...(err.meta ? { meta: err.meta } : {}),
        },
      },
      err.status,
      err.headers,
    );
  }

  console.error(
    JSON.stringify({
      level: 'error',
      correlationId,
      method: c.req.method,
      route: c.req.routePath,
      userId: c.get('userId') ?? null,
      message: err.message,
      stack: err.stack,
    }),
  );

  return c.json(
    {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        correlationId,
      },
    },
    500,
  );
};
