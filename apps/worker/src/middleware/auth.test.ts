import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from './errors';
import type { AuthBindings, AuthVariables } from './auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));

const { authenticate, requireAdmin, requireApproved } = await import('./auth');

const ENV = { DATABASE_URL: 'unused', SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'secret' };

function userRow(overrides: Partial<{ status: string; role: string }> = {}) {
  return {
    id: 'user-1',
    email: 'a@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'member',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildApp() {
  const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
  app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
  app.onError(onError);
  app.get('/me-like', authenticate, (c) => c.json({ user: c.get('authUser') }));
  app.get('/approved-only', authenticate, requireApproved, (c) => c.json({ ok: true }));
  app.get('/admin-only', authenticate, requireApproved, requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

describe('authenticate', () => {
  it('401s when the Authorization header is missing', async () => {
    const res = await buildApp().request('/me-like', undefined, ENV);
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('unauthorized');
  });

  it('401s when the header is not a Bearer token', async () => {
    const res = await buildApp().request('/me-like', { headers: { Authorization: 'Basic xyz' } }, ENV);
    expect(res.status).toBe(401);
  });

  it('401s when Supabase rejects the token', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
    const res = await buildApp().request('/me-like', { headers: { Authorization: 'Bearer bad' } }, ENV);
    expect(res.status).toBe(401);
  });

  it('401s when the verified auth user has no matching users row', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(undefined);
    const res = await buildApp().request('/me-like', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(401);
  });

  it('loads the users row onto context for a valid token', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow());
    const res = await buildApp().request('/me-like', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: unknown }).user).toMatchObject({ id: 'user-1', status: 'approved' });
  });
});

describe('requireApproved', () => {
  it('403s a pending user with waitlist_pending', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow({ status: 'pending' }));
    const res = await buildApp().request('/approved-only', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });

  it('403s a rejected user with waitlist_rejected', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow({ status: 'rejected' }));
    const res = await buildApp().request('/approved-only', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_rejected');
  });

  it('lets an approved user through', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow({ status: 'approved' }));
    const res = await buildApp().request('/approved-only', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(200);
  });
});

describe('requireAdmin', () => {
  it('403s an approved non-admin member', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow({ status: 'approved', role: 'member' }));
    const res = await buildApp().request('/admin-only', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('forbidden');
  });

  it('lets an admin through', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce(userRow({ status: 'approved', role: 'admin' }));
    const res = await buildApp().request('/admin-only', { headers: { Authorization: 'Bearer tok' } }, ENV);
    expect(res.status).toBe(200);
  });
});
