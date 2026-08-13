import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, createProject, listProjects, getProjectById, renameProject, deleteProject, listProjectSources } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getUserById: vi.fn(),
    createProject: vi.fn(),
    listProjects: vi.fn(),
    getProjectById: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
    listProjectSources: vi.fn(),
  }));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({
  createProject,
  listProjects,
  getProjectById,
  renameProject,
  deleteProject,
}));
vi.mock('../lib/db/queries/sources', () => ({ listProjectSources }));

const { default: projectsRoutes } = await import('./projects');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', projectsRoutes);

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'other-1';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function callerRow(overrides: Partial<{ id: string; status: string; role: string }> = {}) {
  return {
    id: overrides.id ?? OWNER_ID,
    email: 'owner@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'member',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function asCaller(overrides?: Parameters<typeof callerRow>[0]) {
  getUser.mockResolvedValueOnce({ data: { user: { id: overrides?.id ?? OWNER_ID } }, error: null });
  getUserById.mockResolvedValueOnce(callerRow(overrides));
}

function request(path: string, init?: RequestInit) {
  return app.request(path, { ...init, headers: { Authorization: 'Bearer tok', ...init?.headers } }, ENV);
}

function projectRow(overrides: Partial<{ id: string; ownerId: string; title: string; citationFormat: string; status: string }> = {}) {
  return {
    id: overrides.id ?? PROJECT_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    title: overrides.title ?? 'My Paper',
    citationFormat: overrides.citationFormat ?? 'mla',
    status: overrides.status ?? 'draft',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

describe('auth gate', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/', undefined, ENV);
    expect(res.status).toBe(401);
  });

  it('403s a pending caller', async () => {
    asCaller({ status: 'pending' });
    const res = await request('/');
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });
});

describe('POST /', () => {
  it('creates a project with a title and citation format', async () => {
    asCaller();
    createProject.mockResolvedValueOnce(projectRow());

    const res = await request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My Paper', citation_format: 'mla' }),
    });

    expect(res.status).toBe(201);
    expect(createProject).toHaveBeenCalledWith(expect.anything(), { ownerId: OWNER_ID, title: 'My Paper', citationFormat: 'mla' });
    expect(await res.json()).toEqual({
      id: PROJECT_ID,
      owner_id: OWNER_ID,
      title: 'My Paper',
      citation_format: 'mla',
      status: 'draft',
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    });
  });

  it('400s a missing title', async () => {
    asCaller();
    const res = await request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citation_format: 'mla' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_title');
  });

  it('400s an invalid citation format', async () => {
    asCaller();
    const res = await request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My Paper', citation_format: 'harvard' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_citation_format');
  });
});

describe('GET /', () => {
  it('lists the caller-owned projects', async () => {
    asCaller();
    listProjects.mockResolvedValueOnce({ projects: [projectRow()], nextCursor: null });

    const res = await request('/');

    expect(res.status).toBe(200);
    expect(listProjects).toHaveBeenCalledWith(expect.anything(), { ownerId: OWNER_ID, cursor: null });
    const body = (await res.json()) as { projects: unknown[]; next_cursor: string | null };
    expect(body.projects).toHaveLength(1);
    expect(body.next_cursor).toBeNull();
  });

  it('accepts a valid ISO cursor and forwards it to the query layer', async () => {
    asCaller();
    listProjects.mockResolvedValueOnce({ projects: [], nextCursor: null });

    const res = await request('/?cursor=2026-01-02T00%3A00%3A00.000Z');

    expect(res.status).toBe(200);
    expect(listProjects).toHaveBeenCalledWith(expect.anything(), {
      ownerId: OWNER_ID,
      cursor: '2026-01-02T00:00:00.000Z',
    });
  });

  it('400s a malformed cursor instead of erroring in the query layer', async () => {
    asCaller();
    const callsBefore = listProjects.mock.calls.length;

    const res = await request('/?cursor=not-a-date');

    expect(res.status).toBe(400);
    expect(listProjects.mock.calls.length).toBe(callsBefore);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe('invalid_cursor');
  });
});

describe('GET /:projectId', () => {
  it('404s a non-UUID projectId', async () => {
    asCaller();
    const res = await request('/not-a-uuid');
    expect(res.status).toBe(404);
  });

  it('404s when no such project exists', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('project_not_found');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('forbidden');
  });

  it('returns the owned project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /:projectId', () => {
  it('renames the project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    renameProject.mockResolvedValueOnce(projectRow({ title: 'New Title' }));

    const res = await request(`/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });

    expect(res.status).toBe(200);
    expect(renameProject).toHaveBeenCalledWith(expect.anything(), { id: PROJECT_ID, title: 'New Title' });
    expect(((await res.json()) as { title: string }).title).toBe('New Title');
  });

  it('403s a non-owner rename attempt', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });
    expect(res.status).toBe(403);
  });

  it('422s an attempt to change citation_format', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow({ citationFormat: 'mla' }));
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title', citation_format: 'apa' }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('citation_format_immutable');
  });

  it('400s a missing title', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /:projectId/bibliography', () => {
  it('returns citation entries for selected sources only', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow({ citationFormat: 'apa' }));
    listProjectSources.mockResolvedValueOnce([
      { id: 'src-1', citationString: 'Doe, J. (2020). Title. Venue.', work: { authors: ['Jane Doe'], publicationYear: 2020 } },
      { id: 'src-2', citationString: null },
    ]);

    const res = await request(`/${PROJECT_ID}/bibliography`);

    expect(res.status).toBe(200);
    expect(listProjectSources).toHaveBeenCalledWith(expect.anything(), { projectId: PROJECT_ID, state: 'selected' });
    expect(await res.json()).toEqual({
      citation_format: 'apa',
      entries: [{ source_id: 'src-1', citation_text: 'Doe, J. (2020). Title. Venue.', in_text_citation: '(Doe, 2020)' }],
    });
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}/bibliography`);
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}/bibliography`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:projectId', () => {
  it('deletes an owned project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(deleteProject).toHaveBeenCalledWith(expect.anything(), PROJECT_ID);
  });

  it('403s a non-owner delete attempt', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
