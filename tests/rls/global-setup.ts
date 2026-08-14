import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// This is the first suite in the repo to hit a real database -- every other test
// mocks `createDb`/`supabase-js` entirely (see docs/testing.md's mocking boundary),
// so nothing else in CI applies migrations before `npm test` runs (ci.yml's TEST step
// only runs `supabase start`, per docs/infra.md that's a separate deploy-time step).
// Both commands are idempotent against an already-migrated/already-pushed database,
// so this is safe to run on every `vitest run` including local re-runs.
export async function setup() {
  execSync('npx drizzle-kit migrate', {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });
  execSync(`npx supabase db push --db-url "${DATABASE_URL}" --yes`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
