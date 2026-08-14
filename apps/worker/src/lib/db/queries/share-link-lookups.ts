import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { shareLinkLookups } from '../schema';

// Sliding window: count rows since `since` rather than a mutable counter,
// same read-side shape as countSuggestionRequestsSince.
export async function countShareLinkLookupsSince(db: Db, params: { ipAddress: string; since: Date }): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(shareLinkLookups)
    .where(and(eq(shareLinkLookups.ipAddress, params.ipAddress), gte(shareLinkLookups.createdAt, params.since)));
  return row?.total ?? 0;
}

export async function recordShareLinkLookup(db: Db, params: { ipAddress: string }): Promise<void> {
  await db.insert(shareLinkLookups).values({ ipAddress: params.ipAddress });
}
