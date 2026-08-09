import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, listWaitlistEntries, approveWaitlistUser, rejectWaitlistUser, listUsers, revokeUserAccess } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getUserById: vi.fn(),
    listWaitlistEntries: vi.fn(),
    approveWaitlistUser: vi.fn(),
    rejectWaitlistUser: vi.fn(),
    listUsers: vi.fn(),
    revokeUserAccess: vi.fn(),
  }));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({
  getUserById,
  listWaitlistEntries,
  approveWaitlistUser,
  rejectWaitlistUser,
}));
vi.mock('../lib/db/queries/users', () => ({
  listUsers,
  revokeUserAccess,
}));

const { default: adminRoutes } = await import('./admin');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', adminRoutes);

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };
const ADMIN_ID = 'admin-1';
const TARGET_ID = '11111111-1111-1111-1111-111111111111';

function callerRow(overrides: Partial<{ id: string; status: string; role: string }> = {}) {
  return {
    id: overrides.id ?? ADMIN_ID,
    email: 'admin@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'admin',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function asCaller(overrides?: Parameters<typeof callerRow>[0]) {
  getUser.mockResolvedValueOnce({ data: { user: { id: (overrides?.id ?? ADMIN_ID) } }, error: null });
  getUserById.mockResolvedValueOnce(callerRow(overrides));
}

function request(path: string, init?: RequestInit) {
  return app.request(path, { ...init, headers: { Authorization: 'Bearer tok', ...init?.headers } }, ENV);
}

describe('admin auth gate', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/waitlist', undefined, ENV);
    expect(res.status).toBe(401);
  });

  it('403s a non-admin approved member', async () => {
    asCaller({ role: 'member' });
    const res = await request('/waitlist');
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('forbidden');
  });

  it('403s a pending admin (waitlist gate applies before the role check)', async () => {
    asCaller({ role: 'admin', status: 'pending' });
    const res = await request('/waitlist');
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });
});

describe('GET /waitlist', () => {
  it('defaults to status=pending and returns entries', async () => {
    asCaller();
    listWaitlistEntries.mockResolvedValueOnce({
      entries: [
        {
          id: 'entry-1',
          userId: TARGET_ID,
          email: 'new@example.test',
          status: 'pending',
          requestedAt: new Date('2026-01-02T00:00:00Z'),
          reviewedAt: null,
        },
      ],
      nextCursor: null,
    });

    const res = await request('/waitlist');

    expect(res.status).toBe(200);
    expect(listWaitlistEntries).toHaveBeenCalledWith(expect.anything(), { status: 'pending', cursor: null });
    expect(await res.json()).toEqual({
      entries: [
        {
          id: 'entry-1',
          user_id: TARGET_ID,
          email: 'new@example.test',
          status: 'pending',
          requested_at: '2026-01-02T00:00:00.000Z',
          reviewed_at: null,
        },
      ],
      next_cursor: null,
    });
  });

  it('400s an invalid status filter', async () => {
    asCaller();
    const res = await request('/waitlist?status=bogus');
    expect(res.status).toBe(400);
  });
});

describe('POST /waitlist/:userId/approve', () => {
  it('404s a non-UUID userId', async () => {
    asCaller();
    const res = await request('/waitlist/not-a-uuid/approve', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('404s when no such user exists', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce(undefined);
    const res = await request(`/waitlist/${TARGET_ID}/approve`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('409s when the entry is not pending', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce({ id: TARGET_ID, status: 'approved' });
    const res = await request(`/waitlist/${TARGET_ID}/approve`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('already_reviewed');
  });

  it('approves a pending entry', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce({ id: TARGET_ID, status: 'pending' });
    approveWaitlistUser.mockResolvedValueOnce({ id: TARGET_ID, status: 'approved' });

    const res = await request(`/waitlist/${TARGET_ID}/approve`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: TARGET_ID, status: 'approved' });
    expect(approveWaitlistUser).toHaveBeenCalledWith(expect.anything(), { userId: TARGET_ID, reviewerId: ADMIN_ID });
  });
});

describe('POST /waitlist/:userId/reject', () => {
  it('rejects a pending entry with an optional reason', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce({ id: TARGET_ID, status: 'pending' });
    rejectWaitlistUser.mockResolvedValueOnce({ id: TARGET_ID, status: 'rejected' });

    const res = await request(`/waitlist/${TARGET_ID}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'duplicate account' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: TARGET_ID, status: 'rejected' });
    expect(rejectWaitlistUser).toHaveBeenCalledWith(expect.anything(), {
      userId: TARGET_ID,
      reviewerId: ADMIN_ID,
      reason: 'duplicate account',
    });
  });
});

describe('GET /users', () => {
  it('lists users with no filters by default', async () => {
    asCaller();
    listUsers.mockResolvedValueOnce({
      users: [
        {
          id: TARGET_ID,
          email: 'member@example.test',
          status: 'approved',
          role: 'member',
          createdAt: new Date('2026-01-03T00:00:00Z'),
        },
      ],
      nextCursor: null,
    });

    const res = await request('/users');

    expect(res.status).toBe(200);
    expect(listUsers).toHaveBeenCalledWith(expect.anything(), { q: undefined, status: undefined, cursor: null });
    expect(await res.json()).toEqual({
      users: [
        {
          id: TARGET_ID,
          email: 'member@example.test',
          status: 'approved',
          role: 'member',
          tier: 'free',
          created_at: '2026-01-03T00:00:00.000Z',
        },
      ],
      next_cursor: null,
    });
  });

  it('passes q, status, and cursor through to the query', async () => {
    asCaller();
    listUsers.mockResolvedValueOnce({ users: [], nextCursor: null });

    const res = await request('/users?q=member&status=approved&cursor=2026-01-01T00%3A00%3A00.000Z');

    expect(res.status).toBe(200);
    expect(listUsers).toHaveBeenCalledWith(expect.anything(), {
      q: 'member',
      status: 'approved',
      cursor: '2026-01-01T00:00:00.000Z',
    });
  });

  it('400s an invalid status filter', async () => {
    asCaller();
    const res = await request('/users?status=bogus');
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_status');
  });

  it('400s an invalid tier filter', async () => {
    asCaller();
    const res = await request('/users?tier=bogus');
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_tier');
  });

  it('short-circuits to an empty page for a non-free tier without querying the db', async () => {
    asCaller();
    listUsers.mockClear();
    const res = await request('/users?tier=plus');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [], next_cursor: null });
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('200s an explicit tier=free filter and queries normally', async () => {
    asCaller();
    listUsers.mockResolvedValueOnce({ users: [], nextCursor: null });
    const res = await request('/users?tier=free');
    expect(res.status).toBe(200);
    expect(listUsers).toHaveBeenCalled();
  });
});

describe('POST /users/:userId/revoke', () => {
  it('404s a non-UUID userId', async () => {
    asCaller();
    const res = await request('/users/not-a-uuid/revoke', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('404s when no such user exists', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce(undefined);
    const res = await request(`/users/${TARGET_ID}/revoke`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('409s a user who is not currently approved', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce({ id: TARGET_ID, status: 'pending' });
    const res = await request(`/users/${TARGET_ID}/revoke`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('not_approved');
  });

  it('revokes an approved user', async () => {
    asCaller();
    getUserById.mockResolvedValueOnce({ id: TARGET_ID, status: 'approved' });
    revokeUserAccess.mockResolvedValueOnce({ id: TARGET_ID, status: 'rejected' });

    const res = await request(`/users/${TARGET_ID}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'policy violation' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: TARGET_ID, status: 'rejected' });
    expect(revokeUserAccess).toHaveBeenCalledWith(expect.anything(), {
      userId: TARGET_ID,
      reviewerId: ADMIN_ID,
      reason: 'policy violation',
    });
  });
});
