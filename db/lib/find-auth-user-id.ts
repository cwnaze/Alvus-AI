import type { SupabaseClient } from '@supabase/supabase-js';

// supabase-js has no "get user by email" admin call, so list-and-find is the only
// option; a single page covers any realistically-sized project's admin/fixture use.
export async function findAuthUserIdByEmail(supabaseAdmin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id ?? null;
}
