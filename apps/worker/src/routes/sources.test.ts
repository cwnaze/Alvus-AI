import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, getProjectById, upsertExternalWork, findOrCreateProjectSource, searchSources } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  getProjectById: vi.fn(),
  upsertExternalWork: vi.fn(),
  findOrCreateProjectSource: vi.fn(),
  searchSources: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/sources', () => ({ upsertExternalWork, findOrCreateProjectSource }));
vi.mock('../lib/sources', () => ({ searchSources }));

const { default: sourcesRoutes } = await import('./sources');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/:projectId', sourcesRoutes);

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'other-1';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const EXTERNAL_WORK_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_SOURCE_ID = '33333333-3333-3333-3333-333333333333';

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

function projectRow(overrides: Partial<{ id: string; ownerId: string; title: string }> = {}) {
  return {
    id: overrides.id ?? PROJECT_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    title: overrides.title ?? 'The Rhetoric of Climate Policy',
    citationFormat: 'mla',
    status: 'draft',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

function externalWorkRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EXTERNAL_WORK_ID,
    doi: '10.1234/climate-2020',
    semanticScholarId: null,
    title: 'Climate Policy Rhetoric in the 21st Century',
    authors: ['Jane Doe'],
    abstract: 'An abstract.',
    publicationYear: 2020,
    venue: 'Journal of Environmental Communication',
    oaStatus: 'gold',
    oaUrl: 'https://example.test/climate-2020.pdf',
    ...overrides,
  };
}

function rawCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    doi: '10.1234/climate-2020',
    semanticScholarId: null,
    title: 'Climate Policy Rhetoric in the 21st Century',
    authors: ['Jane Doe'],
    abstract: 'An abstract.',
    year: 2020,
    venue: 'Journal of Environmental Communication',
    oaStatus: 'gold',
    oaUrl: 'https://example.test/climate-2020.pdf',
    ...overrides,
  };
}

describe('POST /search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches, persists, and returns candidates for the owner', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    searchSources.mockResolvedValueOnce({ candidates: [rawCandidate()], providersUnreachable: false });
    upsertExternalWork.mockResolvedValueOnce(externalWorkRow());
    findOrCreateProjectSource.mockResolvedValueOnce({ id: PROJECT_SOURCE_ID });

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'climate policy rhetoric' }),
    });

    expect(res.status).toBe(200);
    expect(searchSources).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'climate policy rhetoric', limit: 20, openAccessOnly: false }),
      expect.anything(),
    );
    const body = (await res.json()) as { candidates: Array<Record<string, unknown>>; count: number };
    expect(body.count).toBe(1);
    expect(body.candidates[0]).toEqual({
      id: PROJECT_SOURCE_ID,
      title: 'Climate Policy Rhetoric in the 21st Century',
      authors: ['Jane Doe'],
      year: 2020,
      venue: 'Journal of Environmental Communication',
      oa_status: 'gold',
    });
  });

  it('falls back to the project title when no query is given', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow({ title: 'Default Query Title' }));
    searchSources.mockResolvedValueOnce({ candidates: [], providersUnreachable: false });

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(searchSources).toHaveBeenCalledWith(expect.objectContaining({ query: 'Default Query Title' }), expect.anything());
  });

  it('returns an empty candidates list as a valid 200, not an error', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    searchSources.mockResolvedValueOnce({ candidates: [], providersUnreachable: false });

    const res = await request(`/${PROJECT_ID}/search`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [], count: 0 });
  });

  it('502s when every provider is unreachable', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    searchSources.mockResolvedValueOnce({ candidates: [], providersUnreachable: true });

    const res = await request(`/${PROJECT_ID}/search`, { method: 'POST' });

    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('sources_providers_unreachable');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));

    const res = await request(`/${PROJECT_ID}/search`, { method: 'POST' });

    expect(res.status).toBe(403);
    expect(searchSources).not.toHaveBeenCalled();
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);

    const res = await request(`/${PROJECT_ID}/search`, { method: 'POST' });

    expect(res.status).toBe(404);
  });

  it('400s an invalid year_range', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year_range: [2020] }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_year_range');
  });

  it('400s year_range with from > to', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year_range: [2020, 2010] }),
    });

    expect(res.status).toBe(400);
  });

  it('400s an out-of-range limit', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 0 }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_limit');
  });

  it('400s a non-boolean open_access_only', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());

    const res = await request(`/${PROJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_access_only: 'yes' }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_open_access_only');
  });

  it('401s an unauthenticated caller', async () => {
    const res = await app.request(`/${PROJECT_ID}/search`, { method: 'POST' }, ENV);
    expect(res.status).toBe(401);
  });
});
