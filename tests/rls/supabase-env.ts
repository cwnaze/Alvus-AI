import { execSync } from 'node:child_process';

export type LocalSupabaseEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

let cached: LocalSupabaseEnv | null = null;

// Reads the running local stack's own keys rather than hardcoding them: the
// well-known local demo JWT-shaped keys would otherwise be exactly the kind
// of key-shaped literal CLAUDE.md's secret-scanning convention warns against
// committing, and this is more robust to `supabase` rotating the local
// signing key format (already happened once -- see PUBLISHABLE_KEY/SECRET_KEY
// superseding the legacy ANON_KEY/SERVICE_ROLE_KEY pair).
export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  if (cached) return cached;

  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const values: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const match = line.match(/^(\w+)="(.*)"$/);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }

  const apiUrl = values.API_URL;
  const anonKey = values.PUBLISHABLE_KEY;
  const serviceRoleKey = values.SECRET_KEY;
  const dbUrl = values.DB_URL;
  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) {
    throw new Error(
      'Could not parse `supabase status -o env` output -- is the local stack running (`supabase start`)?',
    );
  }

  cached = { apiUrl, anonKey, serviceRoleKey, dbUrl };
  return cached;
}
