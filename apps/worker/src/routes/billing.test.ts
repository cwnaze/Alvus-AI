import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, checkUsageLimit, resolveTier } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  checkUsageLimit: vi.fn(),
  resolveTier: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/metering', () => ({ checkUsageLimit, resolveTier }));

const { default: billingRoutes } = await import('./billing');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', billingRoutes);

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };
const USER_ID = 'user-1';

function callerRow(overrides: Partial<{ id: string; status: string; role: string }> = {}) {
  return {
    id: overrides.id ?? USER_ID,
    email: 'user@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'member',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function asCaller(overrides?: Parameters<typeof callerRow>[0]) {
  getUser.mockResolvedValueOnce({ data: { user: { id: overrides?.id ?? USER_ID } }, error: null });
  getUserById.mockResolvedValueOnce(callerRow(overrides));
}

function request(path: string, init?: RequestInit) {
  return app.request(path, { ...init, headers: { Authorization: 'Bearer tok', ...init?.headers } }, ENV);
}

describe('GET /status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTier.mockReturnValue('free');
  });

  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/status', undefined, ENV);
    expect(res.status).toBe(401);
  });

  it('403s a pending caller', async () => {
    asCaller({ status: 'pending' });
    const res = await request('/status');
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });

  it('reports tier, per-action usage, and a shared reset boundary', async () => {
    asCaller();
    checkUsageLimit
      .mockResolvedValueOnce({ allowed: true, limit: 5, used: 2, resetsAt: '2026-02-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ allowed: true, limit: 3, used: 1, resetsAt: '2026-02-01T00:00:00.000Z' });

    const res = await request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tier: string;
      subscription_status: string | null;
      usage: Record<string, { used: number; limit: number | null }>;
      renews_at: string;
    };
    expect(body).toEqual({
      tier: 'free',
      subscription_status: null,
      usage: {
        source_analysis: { used: 2, limit: 5 },
        feedback_pass: { used: 1, limit: 3 },
      },
      renews_at: '2026-02-01T00:00:00.000Z',
    });
    expect(checkUsageLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: USER_ID, actionType: 'source_analysis' }));
    expect(checkUsageLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: USER_ID, actionType: 'feedback_pass' }));
  });

  it('reports an at-limit action alongside one still under its cap', async () => {
    asCaller();
    checkUsageLimit
      .mockResolvedValueOnce({ allowed: false, limit: 5, used: 5, resetsAt: '2026-02-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ allowed: true, limit: 3, used: 0, resetsAt: '2026-02-01T00:00:00.000Z' });

    const res = await request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { usage: Record<string, { used: number; limit: number | null }> };
    expect(body.usage.source_analysis).toEqual({ used: 5, limit: 5 });
    expect(body.usage.feedback_pass).toEqual({ used: 0, limit: 3 });
  });
});
