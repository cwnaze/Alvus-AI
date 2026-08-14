import type {
  AdminUser,
  AdminUsersResponse,
  WaitlistEntriesResponse,
  WaitlistEntry,
  WaitlistStatus,
} from '@alvus-ai/shared';
import { TIERS, WAITLIST_STATUSES } from '@alvus-ai/shared';
import { Hono, type Context } from 'hono';
import { createDb } from '../lib/db/client';
import {
  approveWaitlistUser,
  getUserById,
  listWaitlistEntries,
  rejectWaitlistUser,
  type UserRow,
  type WaitlistSignupRow,
} from '../lib/db/queries/waitlist';
import { listUsers, revokeUserAccess } from '../lib/db/queries/users';
import { authenticate, requireAdmin, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toWaitlistEntry(row: WaitlistSignupRow): WaitlistEntry {
  return {
    id: row.id,
    user_id: row.userId,
    email: row.email,
    status: row.status,
    requested_at: row.requestedAt ? row.requestedAt.toISOString() : null,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

// The `subscriptions` table exists (US-023), but the admin directory isn't
// wired to it yet -- out of this story's scope (checkout/portal for the
// account's own owner, not admin-facing tier display). Every user still
// shows as `free` here regardless of their actual tier.
function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    role: row.role,
    tier: 'free',
    created_at: row.createdAt.toISOString(),
  };
}

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

const admin = new Hono<Env>();
// docs/api.md's "admin" auth value: authenticated + role=admin, no exception for
// pending/rejected callers the way /auth/me and /auth/logout have.
admin.use('*', authenticate, requireApproved, requireAdmin);

admin.get('/waitlist', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  if (!WAITLIST_STATUSES.includes(status as WaitlistStatus)) {
    throw new AppError(400, 'invalid_status', `status must be one of ${WAITLIST_STATUSES.join(', ')}`);
  }
  const cursor = c.req.query('cursor') ?? null;

  const db = createDb(c.env.DATABASE_URL);
  const { entries, nextCursor } = await listWaitlistEntries(db, { status: status as WaitlistStatus, cursor });
  const response: WaitlistEntriesResponse = { entries: entries.map(toWaitlistEntry), next_cursor: nextCursor };
  return c.json(response, 200);
});

async function review(c: Context<Env>, action: 'approve' | 'reject') {
  const userId = c.req.param('userId');
  if (!userId || !UUID_RE.test(userId)) throw new AppError(404, 'user_not_found', 'No such waitlist entry');

  const db = createDb(c.env.DATABASE_URL);
  const target = await getUserById(db, userId);
  if (!target) throw new AppError(404, 'user_not_found', 'No such waitlist entry');
  if (target.status !== 'pending') {
    throw new AppError(409, 'already_reviewed', `This entry was already ${target.status}`);
  }

  const reviewer = c.get('authUser');
  if (!reviewer) throw new AppError(401, 'unauthorized', 'Authentication required');

  const updated =
    action === 'approve'
      ? await approveWaitlistUser(db, { userId, reviewerId: reviewer.id })
      : await rejectWaitlistUser(db, {
          userId,
          reviewerId: reviewer.id,
          reason: await readReason(c),
        });

  return c.json({ userId: updated.id, status: updated.status }, 200);
}

async function readReason(c: Context<Env>): Promise<string | undefined> {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown };
  return typeof body.reason === 'string' ? body.reason : undefined;
}

admin.post('/waitlist/:userId/approve', (c) => review(c, 'approve'));
admin.post('/waitlist/:userId/reject', (c) => review(c, 'reject'));

admin.get('/users', async (c) => {
  const status = c.req.query('status');
  if (status && !WAITLIST_STATUSES.includes(status as WaitlistStatus)) {
    throw new AppError(400, 'invalid_status', `status must be one of ${WAITLIST_STATUSES.join(', ')}`);
  }
  const tier = c.req.query('tier');
  if (tier && !TIERS.includes(tier as (typeof TIERS)[number])) {
    throw new AppError(400, 'invalid_tier', `tier must be one of ${TIERS.join(', ')}`);
  }
  const q = c.req.query('q') || undefined;
  const cursor = c.req.query('cursor') ?? null;

  const db = createDb(c.env.DATABASE_URL);
  // No account can be on a paid tier yet (see toAdminUser) -- a filter for
  // anything but `free` matches nobody, so skip the query entirely.
  if (tier && tier !== 'free') {
    const response: AdminUsersResponse = { users: [], next_cursor: null };
    return c.json(response, 200);
  }

  const { users: rows, nextCursor } = await listUsers(db, { q, status: status as WaitlistStatus | undefined, cursor });
  const response: AdminUsersResponse = { users: rows.map(toAdminUser), next_cursor: nextCursor };
  return c.json(response, 200);
});

admin.post('/users/:userId/revoke', async (c) => {
  const userId = c.req.param('userId');
  if (!userId || !UUID_RE.test(userId)) throw new AppError(404, 'user_not_found', 'No such user');

  const db = createDb(c.env.DATABASE_URL);
  const target = await getUserById(db, userId);
  if (!target) throw new AppError(404, 'user_not_found', 'No such user');
  if (target.status !== 'approved') {
    throw new AppError(409, 'not_approved', "Only an approved user's access can be revoked");
  }

  const reviewer = c.get('authUser');
  if (!reviewer) throw new AppError(401, 'unauthorized', 'Authentication required');

  const updated = await revokeUserAccess(db, { userId, reviewerId: reviewer.id, reason: await readReason(c) });
  return c.json({ userId: updated.id, status: updated.status }, 200);
});

export default admin;
