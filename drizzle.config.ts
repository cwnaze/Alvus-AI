import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (see .env.example)');
}

export default defineConfig({
  dialect: 'postgresql',
  // Excludes schema/auth.ts on purpose: `auth.users` is a reference-only stub for FK
  // resolution (see that file's comment) and Supabase-managed, so it must never appear
  // in a generated migration. `schemaFilter` does not help here -- it only scopes
  // `introspect`/`push`, not `generate`, which never talks to a live DB.
  schema: [
    './apps/worker/src/lib/db/schema/users.ts',
    './apps/worker/src/lib/db/schema/waitlist-signups.ts',
    './apps/worker/src/lib/db/schema/tier-limits.ts',
  ],
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
