import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// One service-role client per request, same pattern as db/bootstrap-admin.ts and
// db/seed.ts. Used for both user-facing auth operations (signInWithPassword,
// getUser, admin.signOut) and admin-only ones (admin.createUser, admin.listUsers)
// -- the service-role key works for the password grant too, so there is no need
// for a second anon-key client alongside it.
export function createSupabaseAdmin(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
