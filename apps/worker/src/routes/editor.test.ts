import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, getProjectById, getOrCreateDocument, saveDocumentContent, listProjectSources } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  getProjectById: vi.fn(),
  getOrCreateDocument: vi.fn(),
  saveDocumentContent: vi.fn(),
  listProjectSources: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/documents', () => ({ getOrCreateDocument, saveDocumentContent }));
vi.mock('../lib/db/queries/sources', () => ({ listProjectSources }));

const { default: editorRoutes } = await import('./editor');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/:projectId', editorRoutes);

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

function projectRow(overrides: Partial<{ id: string; ownerId: string }> = {}) {
  return {
    id: overrides.id ?? PROJECT_ID,
    ownerId: overrides.ownerId ?? OWNER_ID,
    title: 'My Paper',
    citationFormat: 'mla',
    status: 'draft',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
}

function documentRow(overrides: Partial<{ content: unknown; contentVersion: number; updatedAt: Date }> = {}) {
  return {
    projectId: PROJECT_ID,
    content: overrides.content ?? { type: 'doc', content: [] },
    contentVersion: overrides.contentVersion ?? 1,
    updatedAt: overrides.updatedAt ?? new Date('2026-01-03T00:00:00Z'),
  };
}

describe('GET /', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request(`/${PROJECT_ID}`, undefined, ENV);
    expect(res.status).toBe(401);
  });

  it('403s a pending caller', async () => {
    asCaller({ status: 'pending' });
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns the document content and updated_at, creating the row on first access', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow());

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    expect(getOrCreateDocument).toHaveBeenCalledWith(expect.anything(), PROJECT_ID);
    expect(await res.json()).toEqual({ content: { type: 'doc', content: [] }, updated_at: '2026-01-03T00:00:00.000Z' });
  });
});

describe('PUT /', () => {
  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { type: 'doc' } }),
    });
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { type: 'doc' } }),
    });
    expect(res.status).toBe(404);
  });

  it('400s a missing content field', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_content');
    expect(saveDocumentContent).not.toHaveBeenCalled();
  });

  it('400s a non-object content field', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const res = await request(`/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'not an object' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_content');
  });

  it('saves the document content and returns updated_at', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };
    saveDocumentContent.mockResolvedValueOnce(documentRow({ content, updatedAt: new Date('2026-01-04T00:00:00Z') }));

    const res = await request(`/${PROJECT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    expect(res.status).toBe(200);
    expect(saveDocumentContent).toHaveBeenCalledWith(expect.anything(), { projectId: PROJECT_ID, content });
    expect(await res.json()).toEqual({ updated_at: '2026-01-04T00:00:00.000Z' });
  });
});

describe('POST /format', () => {
  beforeEach(() => vi.clearAllMocks());

  function request(path: string) {
    return app.request(
      `${path}/format`,
      { method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      ENV,
    );
  }

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(404);
  });

  it('422s an empty document', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow({ content: { type: 'doc', content: [{ type: 'paragraph' }] } }));
    const res = await request(`/${PROJECT_ID}`);
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('empty_document');
    expect(saveDocumentContent).not.toHaveBeenCalled();
  });

  it('refreshes a citation whose source is still selected and reports no dangling citations', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A claim ' },
            { type: 'citation', attrs: { sourceId: 'src-1', text: '(Stale)', dangling: false } },
          ],
        },
      ],
    };
    getOrCreateDocument.mockResolvedValueOnce(documentRow({ content }));
    listProjectSources.mockResolvedValueOnce([{ id: 'src-1', work: { authors: ['Jane Doe'], publicationYear: 2020 } }]);
    saveDocumentContent.mockImplementationOnce((_db, params) =>
      Promise.resolve(documentRow({ content: params.content, updatedAt: new Date('2026-01-05T00:00:00Z') })),
    );

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    expect(listProjectSources).toHaveBeenCalledWith(expect.anything(), { projectId: PROJECT_ID, state: 'selected' });
    const body = (await res.json()) as { content: { content: [{ content: unknown[] }] }; dangling_citations: unknown[] };
    expect(body.dangling_citations).toEqual([]);
    expect(body.content.content[0].content[1]).toEqual({ type: 'citation', attrs: { sourceId: 'src-1', text: '(Doe)', dangling: false } });
  });

  it('flags a citation whose source is no longer selected as dangling', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { sourceId: 'gone', text: '(Doe)', dangling: false } }] }],
    };
    getOrCreateDocument.mockResolvedValueOnce(documentRow({ content }));
    listProjectSources.mockResolvedValueOnce([]);
    saveDocumentContent.mockImplementationOnce((_db, params) => Promise.resolve(documentRow({ content: params.content })));

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { dangling_citations: Array<{ source_id: string }> };
    expect(body.dangling_citations).toEqual([{ source_id: 'gone' }]);
  });
});
