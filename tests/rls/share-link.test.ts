import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharedRoutes from '../../apps/worker/src/routes/shared';
import { hashShareToken } from '../../apps/worker/src/lib/share-links/token';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from '../../apps/worker/src/middleware/errors';
import { createTestUser, deleteTestUser, scopedClient, serviceDb, type TestUser } from './fixtures';
import { getLocalSupabaseEnv } from './supabase-env';

// Obviously-fake, repeating-pattern tokens (CLAUDE.md's fixture-credential
// convention) -- these never need to decrypt to anything real, only to hash
// to a lookup value nothing else collides with.
const TOKEN_A = 'ab'.repeat(32);
const UNKNOWN_TOKEN = 'cd'.repeat(32);

describe('Share-link read path: exposes only the single linked project (real DB, no mocks)', () => {
  const sql = serviceDb();
  // Mirrors how index.ts mounts this router -- onError is registered on the
  // top app, not the sub-router (same pattern as routes/auth.test.ts), so a
  // bare `sharedRoutes.request(...)` would surface AppError as a raw 500
  // instead of the intended 404/410.
  const app = new Hono<{ Bindings: { DATABASE_URL: string }; Variables: ErrorVariables }>();
  app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
  app.onError(onError);
  app.route('/', sharedRoutes);

  let ownerA: TestUser;
  let ownerB: TestUser;
  let outsider: TestUser;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    [ownerA, ownerB, outsider] = await Promise.all([
      createTestUser(sql, 'approved'),
      createTestUser(sql, 'approved'),
      createTestUser(sql, 'approved'),
    ]);

    const [projectA] = await sql`
      insert into public.projects (owner_id, title, citation_format)
      values (${ownerA.id}, 'Shared paper A', 'mla')
      returning id
    `;
    projectAId = projectA!.id;
    await sql`
      insert into public.project_documents (project_id, content)
      values (${projectAId}, ${sql.json({ type: 'doc', content: [] })})
    `;

    const [projectB] = await sql`
      insert into public.projects (owner_id, title, citation_format)
      values (${ownerB.id}, 'Private paper B', 'apa')
      returning id
    `;
    projectBId = projectB!.id;
    await sql`
      insert into public.project_documents (project_id, content)
      values (${projectBId}, ${sql.json({ type: 'doc', content: [] })})
    `;

    const tokenHashA = await hashShareToken(TOKEN_A);
    await sql`
      insert into public.share_links (project_id, token_hash, token_encrypted, created_by)
      values (${projectAId}, ${tokenHashA}, 'unused-in-this-test', ${ownerA.id})
    `;
  });

  afterAll(async () => {
    await Promise.all([ownerA, ownerB, outsider].map((u) => deleteTestUser(u.id)));
    await sql.end();
  });

  function callShared(token: string) {
    const { dbUrl } = getLocalSupabaseEnv();
    return app.request(`/${token}`, undefined, { DATABASE_URL: dbUrl });
  }

  it('resolves a valid token to exactly the linked project and nothing from any other project', async () => {
    const res = await callShared(TOKEN_A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { id: string; title: string } };
    expect(body.project.id).toBe(projectAId);
    expect(body.project.title).toBe('Shared paper A');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(projectBId);
    expect(serialized).not.toContain('Private paper B');
  });

  it('404s a token that matches no share link', async () => {
    const res = await callShared(UNKNOWN_TOKEN);
    expect(res.status).toBe(404);
  });

  it('still denies a third party reading the linked project directly via anon-key + RLS, even though a share link exists', async () => {
    const { data, error } = await scopedClient(outsider.accessToken).from('projects').select('id').eq('id', projectAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
