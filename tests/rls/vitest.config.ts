import { defineConfig } from 'vitest/config';

// Plain Node environment, not @cloudflare/vitest-pool-workers -- this suite makes
// real TCP/HTTP calls to the local Supabase stack (Postgres + GoTrue + PostgREST),
// which is what apps/worker's postgres.js/supabase-js clients also do at runtime;
// Node is where that's simplest to exercise directly, matching docs/testing.md's
// "Worker/API integration against local `supabase start` Postgres, real roles/JWTs"
// tier description.
export default defineConfig({
  test: {
    globalSetup: './global-setup.ts',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
