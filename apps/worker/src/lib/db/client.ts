import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

// Matches the per-attempt timeout lib/net/fetch-with-retry.ts uses for external calls:
// a stuck connection or query fails fast into a clean Postgres error instead of hanging
// the request (and the client isolate) forever with nothing surfaced to the user or
// logged for an operator. See docs/production-readiness.md must-fix #2 -- reproduced
// live as 5 demo specs that hung with zero response.
const CONNECT_TIMEOUT_SECONDS = 5;
const STATEMENT_TIMEOUT_MS = 8000;

// One connection per request: Workers isolates don't share a process, so there's no
// pool to exhaust. `prepare: false` is required against Supabase's pooled connection
// string (pgbouncer transaction mode doesn't support prepared statements).
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    prepare: false,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  });
  return drizzle(client, { schema });
}
