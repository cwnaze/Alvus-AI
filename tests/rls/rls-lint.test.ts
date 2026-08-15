import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from './fixtures';

// Lint/test step from US-026's fourth acceptance criterion: fails the build
// the moment a new table lands in `public` without RLS enabled, regardless
// of whether it ends up reachable via the anon key -- "ship RLS-enabled from
// day one" (docs/security.md) is cheapest to enforce as "always", not
// "only for tables someone remembered to grant".
describe('Every public table ships with RLS enabled', () => {
  const sql = serviceDb();

  afterAll(async () => {
    await sql.end();
  });

  it('has row-level security enabled on every base table in the public schema', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `;

    expect(rows.length).toBeGreaterThan(0);

    const withoutRls = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(
      withoutRls,
      `Tables missing RLS: ${withoutRls.join(', ')} -- add "alter table public.<name> enable row level security;" plus an explicit policy in a new drizzle/migrations/*.sql file (RLS on public tables belongs in the drizzle chain, which runs after the tables exist -- supabase/migrations is applied by "supabase start" before they do).`,
    ).toEqual([]);
  });
});
