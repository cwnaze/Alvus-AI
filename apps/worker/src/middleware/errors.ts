import type { Context } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export type ErrorVariables = RequestIdVariables & { userId?: string };

// Global catch-all for anything a route doesn't handle itself: never leak a raw
// stack trace to the client, but keep it (plus route/user context) in the
// server-side log line so an incident is debuggable from logs alone.
//
// Generic over the app's full Env (not just Variables) so this is assignable to
// `app.onError` regardless of what Bindings the app declares.
export const onError = <E extends { Variables: ErrorVariables }>(err: Error, c: Context<E>) => {
  const correlationId = c.get('requestId');

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
