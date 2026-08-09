import { and, asc, eq, gt } from 'drizzle-orm';
import type { Db } from '../client';
import { users, waitlistSignups } from '../schema';

export type UserRow = typeof users.$inferSelect;
export type WaitlistSignupRow = typeof waitlistSignups.$inferSelect;

// Inserts the profile row and the audit/queue row in one transaction -- the
// `auth.users` row itself is created just before this by Supabase Auth's
// admin.createUser call, which is a separate system and can't share this
// transaction; see docs/security.md's Authentication section.
export async function createPendingUser(db: Db, params: { id: string; email: string }): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: params.id, email: params.email, status: 'pending', role: 'member' });
    await tx.insert(waitlistSignups).values({
      userId: params.id,
      email: params.email,
      status: 'pending',
      requestedAt: now,
    });
  });
}

export async function getUserById(db: Db, id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

const DEFAULT_PAGE_SIZE = 20;

// Cursor is the ISO `requested_at` of the last row returned. Simple rather than
// a compound (requested_at, id) cursor -- acceptable because requested_at
// collisions are effectively impossible for hand-approved signups at this scale.
export async function listWaitlistEntries(
  db: Db,
  params: { status: 'pending' | 'approved' | 'rejected'; cursor?: string | null; limit?: number },
): Promise<{ entries: WaitlistSignupRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const conditions = [eq(waitlistSignups.status, params.status)];
  if (params.cursor) conditions.push(gt(waitlistSignups.requestedAt, new Date(params.cursor)));

  const rows = await db
    .select()
    .from(waitlistSignups)
    .where(and(...conditions))
    .orderBy(asc(waitlistSignups.requestedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const last = entries[entries.length - 1];
  const nextCursor = hasMore && last?.requestedAt ? last.requestedAt.toISOString() : null;
  return { entries, nextCursor };
}

export async function approveWaitlistUser(db: Db, params: { userId: string; reviewerId: string }): Promise<UserRow> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ status: 'approved', updatedAt: now })
      .where(eq(users.id, params.userId))
      .returning();
    await tx
      .update(waitlistSignups)
      .set({ status: 'approved', reviewedAt: now, reviewedBy: params.reviewerId })
      .where(eq(waitlistSignups.userId, params.userId));
    if (!updated) throw new Error(`approveWaitlistUser: user ${params.userId} vanished mid-transaction`);
    return updated;
  });
}

export async function rejectWaitlistUser(
  db: Db,
  params: { userId: string; reviewerId: string; reason?: string },
): Promise<UserRow> {
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
    if (!updated) throw new Error(`rejectWaitlistUser: user ${params.userId} vanished mid-transaction`);
    return updated;
  });
}
