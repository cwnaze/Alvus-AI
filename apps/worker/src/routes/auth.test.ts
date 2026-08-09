import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const {
  createUser,
  deleteUser,
  signOut,
  updateUserById,
  signInWithPassword,
  getUser,
  refreshSession,
  resetPasswordForEmail,
  verifyOtp,
  createPendingUser,
  getUserById,
} = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
  updateUserById: vi.fn(),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  createPendingUser: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({
    auth: {
      admin: { createUser, deleteUser, signOut, updateUserById },
      signInWithPassword,
      getUser,
      refreshSession,
      resetPasswordForEmail,
      verifyOtp,
    },
  }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ createPendingUser, getUserById }));

const { default: authRoutes } = await import('./auth');

// Mirrors how index.ts mounts this router -- onError is registered on the top
// app, not the sub-router, so a bare `authRoutes.request(...)` would miss it.
const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', authRoutes);

const ENV = {
  DATABASE_URL: 'unused',
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SECRET_KEY: 'secret',
  PUBLIC_APP_URL: 'http://localhost:8787',
};

function request(path: string, init?: RequestInit) {
  return app.request(path, init, ENV);
}

function jsonRequest(path: string, body: unknown, init?: RequestInit) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
    ...init,
  });
}

describe('POST /signup', () => {
  it('400s an invalid email', async () => {
    const res = await jsonRequest('/signup', { email: 'not-an-email', password: 'longenough1' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_email');
  });

  it('400s a too-short password', async () => {
    const res = await jsonRequest('/signup', { email: 'new@example.test', password: 'short' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_password');
  });

  it('creates the auth user and a pending users/waitlist_signups row, returning 201 pending_approval', async () => {
    createUser.mockResolvedValueOnce({ data: { user: { id: 'auth-1' } }, error: null });
    createPendingUser.mockResolvedValueOnce(undefined);

    const res = await jsonRequest('/signup', { email: 'new@example.test', password: 'longenough1' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: 'pending_approval' });
    expect(createUser).toHaveBeenCalledWith({ email: 'new@example.test', password: 'longenough1', email_confirm: true });
    expect(createPendingUser).toHaveBeenCalledWith(expect.anything(), { id: 'auth-1', email: 'new@example.test' });
  });

  it('409s when the email is already registered', async () => {
    createUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'email_exists', message: 'already registered' } });

    const res = await jsonRequest('/signup', { email: 'dup@example.test', password: 'longenough1' });

    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('email_exists');
  });

  it('cleans up the orphaned auth user if the DB insert fails', async () => {
    createUser.mockResolvedValueOnce({ data: { user: { id: 'auth-2' } }, error: null });
    createPendingUser.mockRejectedValueOnce(new Error('db down'));
    deleteUser.mockResolvedValueOnce({ data: {}, error: null });

    const res = await jsonRequest('/signup', { email: 'new2@example.test', password: 'longenough1' });

    expect(res.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith('auth-2');
  });
});

describe('POST /login', () => {
  it('401s invalid credentials', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'bad creds' } });
    const res = await jsonRequest('/login', { email: 'a@example.test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_credentials');
  });

  it('returns 200 with tokens and the users row for correct credentials, regardless of waitlist status', async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'at', refresh_token: 'rt' },
        user: { id: 'user-1' },
      },
      error: null,
    });
    getUserById.mockResolvedValueOnce({
      id: 'user-1',
      email: 'pending@example.test',
      status: 'pending',
      role: 'member',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const res = await jsonRequest('/login', { email: 'pending@example.test', password: 'correct' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: 'user-1', email: 'pending@example.test', status: 'pending', role: 'member', created_at: '2026-01-01T00:00:00.000Z' },
    });
  });
});

describe('POST /refresh', () => {
  it('401s without a refresh token', async () => {
    const res = await jsonRequest('/refresh', {});
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_refresh_token');
  });

  it('401s an invalid or expired refresh token', async () => {
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'expired' } });
    const res = await jsonRequest('/refresh', { refresh_token: 'stale-rt' });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_refresh_token');
  });

  it('returns a rotated access/refresh token pair', async () => {
    refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'new-at', refresh_token: 'new-rt' } },
      error: null,
    });

    const res = await jsonRequest('/refresh', { refresh_token: 'old-rt' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'new-at', refresh_token: 'new-rt' });
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: 'old-rt' });
  });
});

describe('POST /logout', () => {
  it('401s without a token', async () => {
    const res = await request('/logout', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('revokes the session globally and returns 204', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce({
      id: 'user-1',
      email: 'a@example.test',
      status: 'approved',
      role: 'member',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    signOut.mockResolvedValueOnce({ data: {}, error: null });

    const res = await request('/logout', { method: 'POST', headers: { Authorization: 'Bearer tok' } });

    expect(res.status).toBe(204);
    expect(signOut).toHaveBeenCalledWith('tok', 'global');
  });
});

describe('POST /password-reset/request', () => {
  it('202s and calls resetPasswordForEmail for a well-formed, registered email', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const res = await jsonRequest('/password-reset/request', { email: 'known@example.test' });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({});
    expect(resetPasswordForEmail).toHaveBeenCalledWith('known@example.test', {
      redirectTo: 'http://localhost:8787/reset-password',
    });
  });

  it('202s identically for an email that does not exist, without revealing that', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: { message: 'user not found', status: 400 } });

    const res = await jsonRequest('/password-reset/request', { email: 'unknown@example.test' });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({});
  });

  it('202s a malformed email without calling Supabase at all', async () => {
    const res = await jsonRequest('/password-reset/request', { email: 'not-an-email' });

    expect(res.status).toBe(202);
    expect(resetPasswordForEmail).not.toHaveBeenCalledWith('not-an-email', expect.anything());
  });

  it('429s when Supabase reports a rate limit', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: { message: 'rate limited', status: 429 } });

    const res = await jsonRequest('/password-reset/request', { email: 'known@example.test' });

    expect(res.status).toBe(429);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('rate_limited');
  });
});

describe('POST /password-reset/confirm', () => {
  it('400s a missing token', async () => {
    const res = await jsonRequest('/password-reset/confirm', { new_password: 'longenough1' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_token');
  });

  it('400s a too-short new password', async () => {
    const res = await jsonRequest('/password-reset/confirm', { token: 'tok', new_password: 'short' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_password');
  });

  it('400s an invalid or expired token', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired' } });

    const res = await jsonRequest('/password-reset/confirm', { token: 'stale-tok', new_password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_token');
  });

  it('verifies the token, updates the password, and returns 200', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    updateUserById.mockResolvedValueOnce({ data: {}, error: null });

    const res = await jsonRequest('/password-reset/confirm', { token: 'good-tok', new_password: 'longenough1' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'good-tok', type: 'recovery' });
    expect(updateUserById).toHaveBeenCalledWith('user-1', { password: 'longenough1' });
  });

  it('400s if the password update itself fails', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    updateUserById.mockResolvedValueOnce({ data: {}, error: { message: 'db down' } });

    const res = await jsonRequest('/password-reset/confirm', { token: 'good-tok', new_password: 'longenough1' });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('reset_failed');
  });
});

describe('GET /me', () => {
  it('returns the caller even when pending', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    getUserById.mockResolvedValueOnce({
      id: 'user-1',
      email: 'pending@example.test',
      status: 'pending',
      role: 'member',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const res = await request('/me', { headers: { Authorization: 'Bearer tok' } });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('pending');
  });
});
