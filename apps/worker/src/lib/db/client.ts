import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

// One connection per request: Workers isolates don't share a process, so there's no
// pool to exhaust. `prepare: false` is required against Supabase's pooled connection
// string (pgbouncer transaction mode doesn't support prepared statements).
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}
