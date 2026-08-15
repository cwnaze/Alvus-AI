import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { getLocalSupabaseEnv } from './supabase-env';

// Synthetic, non-production fixture credential -- same convention as
// db/seed.ts's FIXTURE_PASSWORD, safe to read from source (CLAUDE.md).
const FIXTURE_PASSWORD = 'Rls-Test-Passw0rd!1';

export type TestUserStatus = 'pending' | 'approved' | 'rejected';

export type TestUser = {
  id: string;
  email: string;
  accessToken: string;
};

// One connection per test file, closed in that file's `afterAll`. Connects as
// the `postgres` role (same connection string apps/worker's `createDb` uses
// at runtime) -- RLS-bypassing, used only for fixture setup/teardown and for
// the "every table has RLS enabled" lint check, never to exercise a policy.
export function serviceDb() {
  const { dbUrl } = getLocalSupabaseEnv();
  return postgres(dbUrl, { prepare: false });
}

function adminClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = getLocalSupabaseEnv();
  return createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function anonClient(): SupabaseClient {
  const { apiUrl, anonKey } = getLocalSupabaseEnv();
  return createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// A PostgREST client carrying a real user's access token -- this is the
// "bypassing the API layer" surface the acceptance criteria call for: it
// talks directly to Supabase's Data API (anon key + JWT), never through the
// Hono Worker, so a passing test proves RLS itself denies access, not the
// app's own middleware.
export function scopedClient(accessToken: string): SupabaseClient {
  const { apiUrl, anonKey } = getLocalSupabaseEnv();
  return createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Creates a real Supabase Auth user plus a `public.users` row in the given
// waitlist state, then signs in for a real access token -- GoTrue itself has
// no concept of waitlist status, so a pending/rejected user gets a perfectly
// valid JWT (only `public.users.status` marks them un-approved), which is
// exactly the scenario the acceptance criteria need: proof that RLS itself
// checks approval, not just the Hono `requireApproved` middleware.
export async function createTestUser(sql: postgres.Sql, status: TestUserStatus): Promise<TestUser> {
  const email = `rls-test-${randomUUID()}@example.test`;
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.createUser({ email, password: FIXTURE_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createTestUser: createUser returned no user');
  const id = data.user.id;

  await sql`
    insert into public.users (id, email, status, role)
    values (${id}, ${email}, ${status}, 'member')
    on conflict (id) do update set status = excluded.status
  `;

  const { data: signIn, error: signInError } = await anonClient().auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (signInError || !signIn.session) throw signInError ?? new Error('createTestUser: sign-in returned no session');

  return { id, email, accessToken: signIn.session.access_token };
}

export async function deleteTestUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id);
}
