import { and, asc, eq, gt, ilike, type SQL } from 'drizzle-orm';
import type { WaitlistStatus } from '@alvus-ai/shared';
import type { Db } from '../client';
import { users, waitlistSignups } from '../schema';
import type { UserRow } from './waitlist';

const DEFAULT_PAGE_SIZE = 20;

// Cursor is the ISO `created_at` of the last row returned, same simple-cursor
// tradeoff as listWaitlistEntries -- collisions are effectively impossible at
// this scale.
export async function listUsers(
  db: Db,
  params: { q?: string; status?: WaitlistStatus; cursor?: string | null; limit?: number },
): Promise<{ users: UserRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const conditions: SQL[] = [];
  if (params.status) conditions.push(eq(users.status, params.status));
  if (params.q) conditions.push(ilike(users.email, `%${params.q}%`));
  if (params.cursor) conditions.push(gt(users.createdAt, new Date(params.cursor)));

  const rows = await db
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const last = entries[entries.length - 1];
  const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;
  return { users: entries, nextCursor };
}

// Revoking an already-approved user's access is not a waitlist review action,
// but waitlist_signups.status is documented (docs/data-model.md) to always
// mirror users.status, so this keeps both in sync the same way
// approve/rejectWaitlistUser do.
export async function revokeUserAccess(db: Db, params: { userId: string; reviewerId: string; reason?: string }): Promise<UserRow> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ status: 'rejected', updatedAt: now })
      .where(eq(users.id, params.userId))
      .returning();
    await tx
      .update(waitlistSignups)
      .set({ status: 'rejected', reviewedAt: now, reviewedBy: params.reviewerId, notes: params.reason })
      .where(eq(waitlistSignups.userId, params.userId));
    if (!updated) throw new Error(`revokeUserAccess: user ${params.userId} vanished mid-transaction`);
    return updated;
  });
}
