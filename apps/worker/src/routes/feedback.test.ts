import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../lib/ai/types';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string; meta?: Record<string, unknown> } };

const {
  getUser,
  getUserById,
  getProjectById,
  getOrCreateDocument,
  createFeedbackPass,
  listFeedbackPasses,
  getFeedbackPassById,
  requestFeedbackPass,
  assertWithinUsageLimit,
  recordUsage,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  getProjectById: vi.fn(),
  getOrCreateDocument: vi.fn(),
  createFeedbackPass: vi.fn(),
  listFeedbackPasses: vi.fn(),
  getFeedbackPassById: vi.fn(),
  requestFeedbackPass: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/db/queries/projects', () => ({ getProjectById }));
vi.mock('../lib/db/queries/documents', () => ({ getOrCreateDocument }));
vi.mock('../lib/db/queries/feedback', () => ({ createFeedbackPass, listFeedbackPasses, getFeedbackPassById }));
vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return { ...actual, requestFeedbackPass };
});
vi.mock('../lib/metering', () => ({ assertWithinUsageLimit, recordUsage }));

const { default: feedbackRoutes } = await import('./feedback');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/:projectId', feedbackRoutes);

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'other-1';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const PASS_ID = '44444444-4444-4444-4444-444444444444';

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

function documentRow(overrides: Partial<{ content: unknown }> = {}) {
  return {
    projectId: PROJECT_ID,
    content: overrides.content ?? {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The quick brown fox jumps.' }] }],
    },
    contentVersion: 1,
    updatedAt: new Date('2026-01-03T00:00:00Z'),
  };
}

function feedbackPassRow(overrides: Partial<{ id: string; comments: unknown[]; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? PASS_ID,
    projectId: PROJECT_ID,
    comments: overrides.comments ?? [{ id: 'c-1', anchor: { from: 5, to: 10 }, category: 'wording', text: 'Consider a simpler word.' }],
    createdAt: overrides.createdAt ?? new Date('2026-01-04T00:00:00Z'),
  };
}

describe('POST /', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertWithinUsageLimit.mockResolvedValue(undefined);
    recordUsage.mockResolvedValue(undefined);
  });

  function post(path: string) {
    return app.request(
      `${path}`,
      { method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      ENV,
    );
  }

  it('401s an unauthenticated caller', async () => {
    const res = await app.request(
      `/${PROJECT_ID}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('403s a pending caller', async () => {
    asCaller({ status: 'pending' });
    const res = await post(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await post(`/${PROJECT_ID}`);
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent project', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(undefined);
    const res = await post(`/${PROJECT_ID}`);
    expect(res.status).toBe(404);
  });

  it('422s an empty document without checking the usage limit', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow({ content: { type: 'doc', content: [{ type: 'paragraph' }] } }));
    const res = await post(`/${PROJECT_ID}`);
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('empty_document');
    expect(assertWithinUsageLimit).not.toHaveBeenCalled();
  });

  it('402s once the usage limit is exceeded, never calling the AI', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow());
    const { AppError } = await import('../middleware/errors');
    assertWithinUsageLimit.mockRejectedValueOnce(
      new AppError(402, 'usage_limit_exceeded', 'You have reached your monthly limit for this action on your current plan.', {
        limit: 3,
        used: 3,
        resets_at: '2026-02-01T00:00:00.000Z',
      }),
    );

    const res = await post(`/${PROJECT_ID}`);

    expect(res.status).toBe(402);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('usage_limit_exceeded');
    expect(requestFeedbackPass).not.toHaveBeenCalled();
  });

  it('502s when the AI provider is unreachable', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow());
    requestFeedbackPass.mockRejectedValueOnce(new AiProviderError('down'));

    const res = await post(`/${PROJECT_ID}`);

    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('ai_provider_unreachable');
    expect(createFeedbackPass).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('creates a pass with anchors resolved against the document, dropping comments whose quote cannot be located', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getOrCreateDocument.mockResolvedValueOnce(documentRow());
    requestFeedbackPass.mockResolvedValueOnce({
      comments: [
        { category: 'wording', text: 'Consider "fast" instead.', quote: 'quick brown' },
        { category: 'content', text: 'This quote does not exist in the document.', quote: 'nonexistent phrase' },
      ],
      tokenUsage: { inputTokens: 42, outputTokens: 17 },
    });
    createFeedbackPass.mockImplementationOnce((_db, params) =>
      Promise.resolve(feedbackPassRow({ comments: params.comments.map((c: { category: string; text: string }, i: number) => ({ id: `c-${i}`, ...c })) })),
    );

    const res = await post(`/${PROJECT_ID}`);

    expect(res.status).toBe(201);
    expect(createFeedbackPass).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: PROJECT_ID,
        comments: [expect.objectContaining({ category: 'wording', text: 'Consider "fast" instead.', anchor: { from: 5, to: 16 } })],
      }),
    );
    expect(recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: OWNER_ID, projectId: PROJECT_ID, actionType: 'feedback_pass', tokenCostInput: 42, tokenCostOutput: 17 }),
    );
    const body = (await res.json()) as { pass_id: string; comments: unknown[] };
    expect(body.pass_id).toBe(PASS_ID);
    expect(body.comments).toHaveLength(1);
  });
});

describe('GET /', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('lists past passes newest-first with a comment count, not the full comments', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    listFeedbackPasses.mockResolvedValueOnce({ passes: [feedbackPassRow()], nextCursor: null });

    const res = await request(`/${PROJECT_ID}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { passes: Array<{ pass_id: string; comment_count: number }>; next_cursor: string | null };
    expect(body.passes).toEqual([{ pass_id: PASS_ID, created_at: '2026-01-04T00:00:00.000Z', comment_count: 1 }]);
    expect(body.next_cursor).toBeNull();
  });
});

describe('GET /:passId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('403s a non-owner', async () => {
    asCaller({ id: OTHER_USER_ID });
    getProjectById.mockResolvedValueOnce(projectRow({ ownerId: OWNER_ID }));
    const res = await request(`/${PROJECT_ID}/${PASS_ID}`);
    expect(res.status).toBe(403);
  });

  it('404s a nonexistent pass', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getFeedbackPassById.mockResolvedValueOnce(undefined);
    const res = await request(`/${PROJECT_ID}/${PASS_ID}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('feedback_pass_not_found');
  });

  it('reopens a past pass with its full comments', async () => {
    asCaller();
    getProjectById.mockResolvedValueOnce(projectRow());
    getFeedbackPassById.mockResolvedValueOnce(feedbackPassRow());

    const res = await request(`/${PROJECT_ID}/${PASS_ID}`);

    expect(res.status).toBe(200);
    expect(getFeedbackPassById).toHaveBeenCalledWith(expect.anything(), { id: PASS_ID, projectId: PROJECT_ID });
    const body = (await res.json()) as { pass_id: string; comments: unknown[] };
    expect(body.pass_id).toBe(PASS_ID);
    expect(body.comments).toHaveLength(1);
  });
});
