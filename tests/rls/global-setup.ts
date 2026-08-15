import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocalSupabaseEnv } from './supabase-env';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

// This is the first suite in the repo to hit a real database -- every other test
// mocks `createDb`/`supabase-js` entirely (see docs/testing.md's mocking boundary),
// so nothing else in CI applies migrations before `npm test` runs (ci.yml's TEST step
// only runs `supabase start`, per docs/infra.md that's a separate deploy-time step).
// Both commands are idempotent against an already-migrated/already-pushed database,
// so this is safe to run on every `vitest run` including local re-runs.
//
// The target URL comes from `getLocalSupabaseEnv()` (the running local stack), never
// from `process.env.DATABASE_URL` -- that var is also what `deploy.yml` points at the
// real production Supabase project, and this repo's own `.env` sets it to that
// production pooler connection string. Trusting it here would let a non-dry-run
// migrate + `db push --yes` run against production the moment a developer's shell
// happens to have it exported.
export async function setup() {
  const { dbUrl } = getLocalSupabaseEnv();
  execSync('npx drizzle-kit migrate', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
  execSync(`npx supabase db push --db-url "${dbUrl}" --yes`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
