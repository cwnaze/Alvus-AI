import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { shareLinks } from '../schema';

export type ShareLinkRow = typeof shareLinks.$inferSelect;

// Only one link is ever active per project at a time (see createShareLink's
// idempotency) -- `revoked_at IS NULL` is enough to find it, no need to also
// filter unexpired here since nothing currently sets `expires_at`.
export async function getActiveShareLinkByProject(db: Db, projectId: string): Promise<ShareLinkRow | undefined> {
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.projectId, projectId), isNull(shareLinks.revokedAt)));
  return row;
}

export async function createShareLink(
  db: Db,
  params: { projectId: string; createdBy: string; token: string },
): Promise<ShareLinkRow> {
  const [created] = await db
    .insert(shareLinks)
    .values({ projectId: params.projectId, createdBy: params.createdBy, token: params.token })
    .returning();
  if (!created) throw new Error('createShareLink: insert returned no row');
  return created;
}

export async function revokeShareLink(db: Db, params: { id: string }): Promise<void> {
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, params.id));
}

// Returns the row regardless of revoked/expired state -- the caller
// distinguishes "unknown token" (404) from "revoked/expired token" (410),
// which requires knowing the row exists.
export async function findShareLinkByToken(db: Db, token: string): Promise<ShareLinkRow | undefined> {
  const [row] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
  return row;
}

export async function recordShareLinkAccess(db: Db, params: { id: string; now: Date }): Promise<void> {
  await db
    .update(shareLinks)
    .set({ lastAccessedAt: params.now, accessCount: sql`${shareLinks.accessCount} + 1` })
    .where(eq(shareLinks.id, params.id));
}
