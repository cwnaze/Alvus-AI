import type { AuthUser, LoginResponse, RefreshResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { createPendingUser, getUserById, type UserRow } from '../lib/db/queries/waitlist';
import { createSupabaseAdmin } from '../lib/supabase/client';
import { authenticate, extractBearerToken, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function toAuthUser(row: Pick<UserRow, 'id' | 'email' | 'status' | 'role' | 'createdAt'>): AuthUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    role: row.role,
    created_at: row.createdAt.toISOString(),
  };
}

async function parseCredentials(c: { req: { json: () => Promise<unknown> } }) {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { email, password };
}

const auth = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();

auth.post('/signup', async (c) => {
  const { email, password } = await parseCredentials(c);
  if (!EMAIL_RE.test(email)) throw new AppError(400, 'invalid_email', 'A valid email address is required');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, 'invalid_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || /already.*registered/i.test(error?.message ?? '')) {
      throw new AppError(409, 'email_exists', 'An account with this email already exists');
    }
    throw new AppError(400, 'signup_failed', error?.message ?? 'Could not create account');
  }

  const db = createDb(c.env.DATABASE_URL);
  try {
    await createPendingUser(db, { id: data.user.id, email });
  } catch (err) {
    // Best-effort cleanup: without this, a DB failure here would leave an
    // orphaned auth.users row that blocks the same email from ever signing up
    // again (admin.createUser would then fail with email_exists).
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw err;
  }

  return c.json({ message: 'pending_approval' }, 201);
});

auth.post('/login', async (c) => {
  const { email, password } = await parseCredentials(c);
  if (!email || !password) throw new AppError(401, 'invalid_credentials', 'Invalid email or password');

  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }

  const db = createDb(c.env.DATABASE_URL);
  const userRow = await getUserById(db, data.user.id);
  if (!userRow) throw new AppError(401, 'invalid_credentials', 'Invalid email or password');

  // Always 200 for correct credentials regardless of waitlist status --
  // Supabase issues the token before app-level status applies. The frontend
  // branches on `user.status`; the token itself only works for /auth/me and
  // /auth/logout until an admin approves the account (requireApproved rejects
  // everything else with 403).
  const response: LoginResponse = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: toAuthUser(userRow),
  };
  return c.json(response, 200);
});

auth.post('/refresh', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { refresh_token?: unknown } | null;
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
  if (!refreshToken) throw new AppError(401, 'invalid_refresh_token', 'A refresh token is required');

  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError(401, 'invalid_refresh_token', 'Invalid or expired refresh token');

  const response: RefreshResponse = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
  return c.json(response, 200);
});

auth.post('/logout', authenticate, async (c) => {
  const token = extractBearerToken(c);
  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { error } = await supabase.auth.admin.signOut(token, 'global');
  if (error) throw new AppError(401, 'unauthorized', 'Invalid or expired token');
  return c.body(null, 204);
});

auth.post('/password-reset/request', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  // Only ever attempt the Supabase call for a well-formed address, but return
  // the exact same 202 regardless of format, existence, or delivery outcome --
  // GoTrue itself never reveals whether an email is registered, and neither
  // should we. A rate limit is the one exception worth surfacing distinctly:
  // it reveals request frequency, not account existence.
  if (EMAIL_RE.test(email)) {
    const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${c.env.PUBLIC_APP_URL}/reset-password`,
    });
    if (error?.status === 429) {
      throw new AppError(429, 'rate_limited', 'Too many reset requests. Please try again later.');
    }
    if (error) console.error('password-reset/request: resetPasswordForEmail failed', error.message);
  }

  return c.json({}, 202);
});

auth.post('/password-reset/confirm', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { token?: unknown; new_password?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

  if (!token) throw new AppError(400, 'invalid_token', 'This reset link is invalid or has expired');
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, 'invalid_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
  if (error || !data.user) {
    throw new AppError(400, 'invalid_token', 'This reset link is invalid or has expired');
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, { password: newPassword });
  if (updateError) throw new AppError(400, 'reset_failed', 'Could not reset your password. Please try again.');

  return c.json({}, 200);
});

auth.get('/me', authenticate, (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');
  return c.json(toAuthUser(authUser), 200);
});

export default auth;
