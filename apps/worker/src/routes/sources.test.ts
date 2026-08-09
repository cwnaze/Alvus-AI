import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderError, AiUnreadableSourceError } from '../lib/ai/types';
import { AppError, CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string; meta?: Record<string, unknown> } };

const {
  getUser,
  getUserById,
  getProjectById,
  upsertExternalWork,
  findOrCreateProjectSource,
  getProjectSourceById,
  listProjectSources,
  saveProjectSourceAnalysis,
  updateProjectSourceState,
  deleteProjectSource,
  searchSources,
  requestSourceAnalysis,
  assertWithinUsageLimit,
  recordUsage,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  getProjectById: vi.fn(),
  upsertExternalWork: vi.fn(),
  findOrCreateProjectSource: vi.fn(),
  getProjectSourceById: vi.fn(),
  listProjectSources: vi.fn(),
  saveProjectSourceAnalysis: vi.fn(),
  updateProjectSourceState: vi.fn(),
  deleteProjectSource: vi.fn(),
  searchSources: vi.fn(),
  requestSourceAnalysis: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/sources', () => ({
  upsertExternalWork,
  findOrCreateProjectSource,
  getProjectSourceById,
  listProjectSources,
  saveProjectSourceAnalysis,
  updateProjectSourceState,
  deleteProjectSource,
}));
vi.mock('../lib/sources', () => ({ searchSources }));
vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return { ...actual, requestSourceAnalysis };
});
vi.mock('../lib/metering', () => ({ assertWithinUsageLimit, recordUsage }));

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

function projectRow(overrides: Partial<{ id: string; ownerId: string; title: string; citationFormat: string }> = {}) {
  return {
    id: overrides.id ?? PROJECT_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    title: overrides.title ?? 'The Rhetoric of Climate Policy',
    citationFormat: overrides.citationFormat ?? 'mla',
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

function projectSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROJECT_SOURCE_ID,
    projectId: PROJECT_ID,
    origin: 'discovered',
    externalWorkId: EXTERNAL_WORK_ID,
    state: 'candidate',
    citationString: null,
    strengthsSummary: null,
    weaknessesSummary: null,
    usefulnessScore: null,
    keyQuotes: [],
    fullTextAvailable: false,
    fullTextSource: null,
    analyzedAt: null,
    selectedAt: null,
    createdAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    work: externalWorkRow(),
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
    findOrCreateProjectSource.mockResolvedValueOnce({ id: PROJECT_SOURCE_ID, state: 'candidate' });

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

  it('excludes a previously rejected candidate so it does not reappear', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    searchSources.mockResolvedValueOnce({ candidates: [rawCandidate()], providersUnreachable: false });
    upsertExternalWork.mockResolvedValueOnce(externalWorkRow());
    findOrCreateProjectSource.mockResolvedValueOnce({ id: PROJECT_SOURCE_ID, state: 'rejected' });

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

describe('GET /', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists sources for the owner', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    listProjectSources.mockResolvedValueOnce([projectSourceRow()]);

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: Array<Record<string, unknown>> };
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({ id: PROJECT_SOURCE_ID, state: 'candidate', analysis: null });
  });

  it('400s an invalid status filter', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());

    const res = await request(`/${PROJECT_ID}?status=bogus`);

    expect(res.status).toBe(400);
  });
});

describe('GET /:sourceId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns source detail', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: PROJECT_SOURCE_ID, title: 'Climate Policy Rhetoric in the 21st Century' });
  });

  it('404s an unknown source', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(undefined);

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /:sourceId/analysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the analysis once it exists', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(
      projectSourceRow({
        citationString: 'Doe, Jane...',
        strengthsSummary: 's',
        weaknessesSummary: 'w',
        usefulnessScore: '5.00',
        analyzedAt: new Date('2026-01-06T00:00:00Z'),
        fullTextSource: 'abstract_only',
      }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analysis`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ citation: 'Doe, Jane...', usefulness_score: 5, full_text_status: 'abstract_only' });
  });

  it('404s not_yet_analyzed', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analysis`);

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('not_yet_analyzed');
  });
});

describe('POST /:sourceId/analyze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs analysis, renders the citation, persists, and meters on success', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow({ citationFormat: 'mla' }));
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());
    assertWithinUsageLimit.mockResolvedValueOnce(undefined);
    requestSourceAnalysis.mockResolvedValueOnce({
      analysis: {
        strengths: 'Good methodology.',
        weaknesses: 'Narrow sample.',
        usefulnessScore: 7.5,
        keyQuotes: [{ quote: 'A quote.', location: 'Abstract', usageSuggestion: 'Use it.' }],
      },
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
    });
    saveProjectSourceAnalysis.mockResolvedValueOnce(
      projectSourceRow({
        citationString: 'Doe, Jane, "Climate Policy Rhetoric in the 21st Century.", Journal of Environmental Communication, 2020.',
        strengthsSummary: 'Good methodology.',
        weaknessesSummary: 'Narrow sample.',
        usefulnessScore: '7.50',
        keyQuotes: [{ quote: 'A quote.', location: 'Abstract', usage_suggestion: 'Use it.' }],
        fullTextAvailable: true,
        fullTextSource: 'open_access',
        analyzedAt: new Date('2026-02-01T00:00:00Z'),
      }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(saveProjectSourceAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        citationString: 'Doe, Jane, "Climate Policy Rhetoric in the 21st Century.", Journal of Environmental Communication, 2020.',
        fullTextSource: 'open_access',
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.summary).toEqual({ strengths: 'Good methodology.', weaknesses: 'Narrow sample.' });
    expect(body.usefulness_score).toBe(7.5);
    expect(body.full_text_status).toBe('open_access');
    expect(recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionType: 'source_analysis', tokenCostInput: 10, tokenCostOutput: 5 }),
    );
  });

  it('marks abstract_only when the source has no OA link', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ work: externalWorkRow({ oaUrl: null, oaStatus: null }) }));
    assertWithinUsageLimit.mockResolvedValueOnce(undefined);
    requestSourceAnalysis.mockResolvedValueOnce({
      analysis: { strengths: 'S', weaknesses: 'W', usefulnessScore: 5, keyQuotes: [] },
      tokenUsage: { inputTokens: null, outputTokens: null },
    });
    saveProjectSourceAnalysis.mockResolvedValueOnce(
      projectSourceRow({
        citationString: 'c',
        strengthsSummary: 'S',
        weaknessesSummary: 'W',
        usefulnessScore: '5.00',
        fullTextSource: 'abstract_only',
        analyzedAt: new Date(),
      }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(saveProjectSourceAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fullTextSource: 'abstract_only', fullTextAvailable: false }),
    );
    expect((await res.json())).toMatchObject({ full_text_status: 'abstract_only' });
  });

  it('returns the cached analysis without re-running when already analyzed', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(
      projectSourceRow({
        citationString: 'cached',
        strengthsSummary: 's',
        weaknessesSummary: 'w',
        usefulnessScore: '5.00',
        analyzedAt: new Date('2026-01-05T00:00:00Z'),
      }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(requestSourceAnalysis).not.toHaveBeenCalled();
    expect(assertWithinUsageLimit).not.toHaveBeenCalled();
  });

  it('re-runs analysis when force_refresh is true even if already analyzed', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(
      projectSourceRow({ citationString: 'old', analyzedAt: new Date('2026-01-05T00:00:00Z'), usefulnessScore: '3.00' }),
    );
    assertWithinUsageLimit.mockResolvedValueOnce(undefined);
    requestSourceAnalysis.mockResolvedValueOnce({
      analysis: { strengths: 'S', weaknesses: 'W', usefulnessScore: 6, keyQuotes: [] },
      tokenUsage: { inputTokens: null, outputTokens: null },
    });
    saveProjectSourceAnalysis.mockResolvedValueOnce(
      projectSourceRow({
        citationString: 'new',
        strengthsSummary: 'S',
        weaknessesSummary: 'W',
        usefulnessScore: '6.00',
        analyzedAt: new Date(),
      }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_refresh: true }),
    });

    expect(res.status).toBe(200);
    expect(requestSourceAnalysis).toHaveBeenCalledOnce();
  });

  it('402s once the usage limit is exhausted, without calling the AI', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());
    assertWithinUsageLimit.mockRejectedValueOnce(
      new AppError(402, 'usage_limit_exceeded', 'limit reached', { limit: 5, used: 5, resets_at: '2026-03-01T00:00:00.000Z' }),
    );

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(402);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe('usage_limit_exceeded');
    expect(body.error.meta).toEqual({ limit: 5, used: 5, resets_at: '2026-03-01T00:00:00.000Z' });
    expect(requestSourceAnalysis).not.toHaveBeenCalled();
  });

  it('422s an unreadable source and does not record usage', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());
    assertWithinUsageLimit.mockResolvedValueOnce(undefined);
    requestSourceAnalysis.mockRejectedValueOnce(new AiUnreadableSourceError('unreadable'));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('unreadable_source');
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('502s when the AI provider is unreachable', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow());
    assertWithinUsageLimit.mockResolvedValueOnce(undefined);
    requestSourceAnalysis.mockRejectedValueOnce(new AiProviderError('unreachable'));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/analyze`, { method: 'POST' });

    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('ai_provider_unreachable');
  });
});

describe('POST /:sourceId/select', () => {
  beforeEach(() => vi.clearAllMocks());

  it('transitions a candidate to selected', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'candidate' }));
    updateProjectSourceState.mockResolvedValueOnce(projectSourceRow({ state: 'selected' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/select`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'selected' });
    expect(updateProjectSourceState).toHaveBeenCalledWith(expect.anything(), { id: PROJECT_SOURCE_ID, state: 'selected', selectedAt: expect.any(Date) });
  });
});

describe('POST /:sourceId/deselect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a selected source to the candidate pool', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'selected' }));
    updateProjectSourceState.mockResolvedValueOnce(projectSourceRow({ state: 'candidate' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/deselect`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'candidate' });
  });

  it('409s a source that is not currently selected', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'candidate' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/deselect`, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(updateProjectSourceState).not.toHaveBeenCalled();
  });
});

describe('POST /:sourceId/reject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('transitions a candidate to rejected', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'candidate' }));
    updateProjectSourceState.mockResolvedValueOnce(projectSourceRow({ state: 'rejected' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/reject`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'rejected' });
  });

  it('409s an already-selected source', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'selected' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}/reject`, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('already_selected');
    expect(updateProjectSourceState).not.toHaveBeenCalled();
  });
});

describe('DELETE /:sourceId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hard-deletes a selected source', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'selected' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deleteProjectSource).toHaveBeenCalledWith(expect.anything(), { id: PROJECT_SOURCE_ID });
  });

  it('409s deleting a candidate instead of rejecting it', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getProjectSourceById.mockResolvedValueOnce(projectSourceRow({ state: 'candidate' }));

    const res = await request(`/${PROJECT_ID}/${PROJECT_SOURCE_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(409);
    expect(deleteProjectSource).not.toHaveBeenCalled();
  });
});
