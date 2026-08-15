import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createTestUser, deleteTestUser, scopedClient, serviceDb, type TestUser } from './fixtures';

// Proof at the database level -- not the API layer -- that RLS denies
// cross-user access (US-026). Every read here goes through Supabase's
// PostgREST Data API with a real user JWT, never through the Hono Worker, so
// a passing test can only mean RLS itself is doing the denying.
describe('RLS: deny-by-default across roles', () => {
  const sql = serviceDb();

  let ownerA: TestUser;
  let ownerB: TestUser;
  let pendingUser: TestUser;
  let rejectedUser: TestUser;

  let projectAId: string;
  let externalWorkId: string;
  let sourceAId: string;
  let feedbackPassAId: string;
  let pendingProjectId: string;
  let rejectedProjectId: string;

  beforeAll(async () => {
    [ownerA, ownerB, pendingUser, rejectedUser] = await Promise.all([
      createTestUser(sql, 'approved'),
      createTestUser(sql, 'approved'),
      createTestUser(sql, 'pending'),
      createTestUser(sql, 'rejected'),
    ]);

    const [projectA] = await sql`
      insert into public.projects (owner_id, title, citation_format)
      values (${ownerA.id}, 'RLS test project A', 'mla')
      returning id
    `;
    projectAId = projectA!.id;

    await sql`
      insert into public.project_documents (project_id, content)
      values (${projectAId}, ${sql.json({ type: 'doc', content: [] })})
    `;

    const [work] = await sql`
      insert into public.external_works (title)
      values ('RLS test fixture work')
      returning id
    `;
    externalWorkId = work!.id;

    const [source] = await sql`
      insert into public.project_sources (project_id, origin, external_work_id, state)
      values (${projectAId}, 'discovered', ${externalWorkId}, 'candidate')
      returning id
    `;
    sourceAId = source!.id;

    const [feedbackPass] = await sql`
      insert into public.feedback_passes (project_id, comments)
      values (${projectAId}, ${sql.json([])})
      returning id
    `;
    feedbackPassAId = feedbackPass!.id;

    const [pendingProject] = await sql`
      insert into public.projects (owner_id, title, citation_format)
      values (${pendingUser.id}, 'Pending owner project', 'apa')
      returning id
    `;
    pendingProjectId = pendingProject!.id;

    const [rejectedProject] = await sql`
      insert into public.projects (owner_id, title, citation_format)
      values (${rejectedUser.id}, 'Rejected owner project', 'chicago')
      returning id
    `;
    rejectedProjectId = rejectedProject!.id;
  });

  afterAll(async () => {
    // Deleting the auth user cascades through users -> projects -> everything
    // FK'd to it (docs/data-model.md's ON DELETE CASCADE chain), so this is
    // sufficient cleanup on its own.
    await Promise.all([ownerA, ownerB, pendingUser, rejectedUser].map((u) => deleteTestUser(u.id)));
    await sql.end();
  });

  it('lets the owner read their own project via anon-key + JWT', async () => {
    const { data, error } = await scopedClient(ownerA.accessToken).from('projects').select('id').eq('id', projectAId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: projectAId }]);
  });

  it('denies a non-owner reading the project', async () => {
    const { data, error } = await scopedClient(ownerB.accessToken).from('projects').select('id').eq('id', projectAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies a non-owner reading the project_documents row', async () => {
    const { data, error } = await scopedClient(ownerB.accessToken)
      .from('project_documents')
      .select('project_id')
      .eq('project_id', projectAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies a non-owner reading project_sources', async () => {
    const { data, error } = await scopedClient(ownerB.accessToken).from('project_sources').select('id').eq('id', sourceAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies a non-owner reading feedback_passes', async () => {
    const { data, error } = await scopedClient(ownerB.accessToken)
      .from('feedback_passes')
      .select('id')
      .eq('id', feedbackPassAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies a non-owner updating the project', async () => {
    const { error } = await scopedClient(ownerB.accessToken).from('projects').update({ title: 'hijacked' }).eq('id', projectAId);
    expect(error).not.toBeNull();
    const [row] = await sql`select title from public.projects where id = ${projectAId}`;
    expect(row!.title).toBe('RLS test project A');
  });

  it('denies a non-owner inserting a source into someone else\'s project', async () => {
    const { error } = await scopedClient(ownerB.accessToken)
      .from('project_sources')
      .insert({ project_id: projectAId, origin: 'discovered', external_work_id: externalWorkId, state: 'candidate' });
    expect(error).not.toBeNull();
  });

  it('denies a pending user reading their own project (RLS itself checks approval, not just middleware)', async () => {
    const { data, error } = await scopedClient(pendingUser.accessToken).from('projects').select('id').eq('id', pendingProjectId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies a rejected user reading their own project', async () => {
    const { data, error } = await scopedClient(rejectedUser.accessToken).from('projects').select('id').eq('id', rejectedProjectId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('denies an unauthenticated anon-key request outright (no SELECT grant, let alone a policy)', async () => {
    const { data, error } = await anonClient().from('projects').select('id').eq('id', projectAId);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
