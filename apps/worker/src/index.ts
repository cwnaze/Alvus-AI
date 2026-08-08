import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { createDb } from './lib/db/client';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from './middleware/errors';

type Bindings = {
  DATABASE_URL: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: ErrorVariables }>();

app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);

app.get('/api/health', async (c) => {
  // Deliberately not closed: one connection per request against Supabase's
  // pooler (see lib/db/client.ts), torn down by the runtime when the request's
  // execution context ends. Closing it here races the Workers postgres.js
  // polyfill's background stream read and surfaces as an unhandled rejection.
  const db = createDb(c.env.DATABASE_URL);
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('/api/health DB round-trip failed:', err);
    return c.json({ status: 'error', db: 'error' }, 503);
  }
});

export default app;
