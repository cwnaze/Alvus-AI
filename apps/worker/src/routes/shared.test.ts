import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from '../middleware/errors';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { findShareLinkByToken, recordShareLinkAccess, getProjectById, getOrCreateDocument, listProjectSources } = vi.hoisted(() => ({
  findShareLinkByToken: vi.fn(),
  recordShareLinkAccess: vi.fn(),
  getProjectById: vi.fn(),
  getOrCreateDocument: vi.fn(),
  listProjectSources: vi.fn(),
}));

vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/share-links', () => ({ findShareLinkByToken, recordShareLinkAccess }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/documents', () => ({ getOrCreateDocument }));
vi.mock('../lib/db/queries/sources', () => ({ listProjectSources }));

const { default: sharedRoutes } = await import('./shared');

const app = new Hono<{ Bindings: { DATABASE_URL: string }; Variables: ErrorVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', sharedRoutes);

const ENV = { DATABASE_URL: 'unused' };
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const LINK_ID = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'a'.repeat(64);

function linkRow(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date | null }> = {}) {
  return {
    id: LINK_ID,
    projectId: PROJECT_ID,
    token: TOKEN,
    createdBy: 'owner-1',
    createdAt: new Date('2026-01-03T00:00:00Z'),
    expiresAt: overrides.expiresAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

function projectRow() {
  return {
    id: PROJECT_ID,
    ownerId: 'owner-1',
    title: 'My Paper',
    citationFormat: 'apa',
    status: 'draft',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

describe('GET /:token', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the read-only paper for a valid token and records access', async () => {
    findShareLinkByToken.mockResolvedValueOnce(linkRow());
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce({ content: { type: 'doc', content: [] }, updatedAt: new Date('2026-01-04T00:00:00Z') });
    listProjectSources.mockResolvedValueOnce([
      { id: 'src-1', citationString: 'Doe, J. (2020). Title. Venue.', work: { authors: ['Jane Doe'], publicationYear: 2020 } },
      { id: 'src-2', citationString: null },
    ]);

    const res = await app.request(`/${TOKEN}`, undefined, ENV);

    expect(res.status).toBe(200);
    expect(recordShareLinkAccess).toHaveBeenCalledWith(expect.anything(), { id: LINK_ID, now: expect.any(Date) });
    const body = (await res.json()) as {
      project: { id: string; title: string; citation_format: string; owner_id?: string };
      bibliography: unknown[];
    };
    expect(body.project).toEqual({ id: PROJECT_ID, title: 'My Paper', citation_format: 'apa' });
    expect(body.project.owner_id).toBeUndefined();
    expect(body.bibliography).toEqual([{ source_id: 'src-1', citation_text: 'Doe, J. (2020). Title. Venue.', in_text_citation: '(Doe, 2020)' }]);
  });

  it('404s an unknown token', async () => {
    findShareLinkByToken.mockResolvedValueOnce(undefined);

    const res = await app.request(`/${TOKEN}`, undefined, ENV);

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_token');
  });

  it('410s a revoked token', async () => {
    findShareLinkByToken.mockResolvedValueOnce(linkRow({ revokedAt: new Date('2026-01-05T00:00:00Z') }));

    const res = await app.request(`/${TOKEN}`, undefined, ENV);

    expect(res.status).toBe(410);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('link_revoked');
  });

  it('410s an expired token', async () => {
    findShareLinkByToken.mockResolvedValueOnce(linkRow({ expiresAt: new Date('2020-01-01T00:00:00Z') }));

    const res = await app.request(`/${TOKEN}`, undefined, ENV);

    expect(res.status).toBe(410);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('link_revoked');
  });
});
