import type { Context, Next } from 'hono';
import { createDb } from '../lib/db/client';
import { getUserById } from '../lib/db/queries/waitlist';
import { createSupabaseAdmin } from '../lib/supabase/client';
import { AppError, type ErrorVariables } from './errors';

export type AuthUser = {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  role: 'member' | 'admin';
  createdAt: Date;
};

export type AuthVariables = ErrorVariables & { authUser?: AuthUser };

export type AuthBindings = {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
};

export function extractBearerToken(c: Context): string {
  const header = c.req.header('Authorization');
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AppError(401, 'unauthorized', 'Missing or malformed Authorization header');
  return token;
}

// Verified against the Supabase Auth server (a network call via getUser(jwt)),
// not decoded locally -- a locally-decoded JWT would still look valid for its
// full ~1hr lifetime after a user calls /auth/logout, since logout revokes the
// session server-side rather than the token itself. See docs/security.md.
export async function authenticate<E extends { Bindings: AuthBindings; Variables: AuthVariables }>(
  c: Context<E>,
  next: Next,
) {
  const token = extractBearerToken(c);
  const supabase = createSupabaseAdmin(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError(401, 'unauthorized', 'Invalid or expired token');

  const db = createDb(c.env.DATABASE_URL);
  const userRow = await getUserById(db, data.user.id);
  if (!userRow) throw new AppError(401, 'unauthorized', 'No account found for this session');

  c.set('authUser', {
    id: userRow.id,
    email: userRow.email,
    status: userRow.status,
    role: userRow.role,
    createdAt: userRow.createdAt,
  });
  c.set('userId', userRow.id);
  await next();
}

// A valid, signed-in session with status != approved must still be rejected on
// every request (not just login) so a still-valid access token can't outrun an
// admin revoking/rejecting the account -- see docs/security.md. GET /auth/me and
// POST /auth/logout deliberately don't apply this so a pending/rejected user can
// still see their status and sign out.
export async function requireApproved<E extends { Variables: AuthVariables }>(c: Context<E>, next: Next) {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');
  if (authUser.status === 'pending') {
    throw new AppError(403, 'waitlist_pending', 'Your account is awaiting admin approval');
  }
  if (authUser.status === 'rejected') {
    throw new AppError(403, 'waitlist_rejected', 'Your waitlist request was not approved');
  }
  await next();
}

export async function requireAdmin<E extends { Variables: AuthVariables }>(c: Context<E>, next: Next) {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');
  if (authUser.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access required');
  await next();
}
