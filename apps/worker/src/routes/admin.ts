import type { WaitlistEntriesResponse, WaitlistEntry, WaitlistStatus } from '@alvus-ai/shared';
import { WAITLIST_STATUSES } from '@alvus-ai/shared';
import { Hono, type Context } from 'hono';
import { createDb } from '../lib/db/client';
import {
  approveWaitlistUser,
  getUserById,
  listWaitlistEntries,
  rejectWaitlistUser,
  type WaitlistSignupRow,
} from '../lib/db/queries/waitlist';
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

export default admin;
