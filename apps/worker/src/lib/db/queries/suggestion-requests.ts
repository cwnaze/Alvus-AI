import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { suggestionRequests } from '../schema';

// Sliding window: count rows since `since` rather than a mutable counter,
// same read-side shape as sumUsage -- the row is what's authoritative, the
// count is derived at read time.
export async function countSuggestionRequestsSince(db: Db, params: { userId: string; since: Date }): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(suggestionRequests)
    .where(and(eq(suggestionRequests.userId, params.userId), gte(suggestionRequests.createdAt, params.since)));
  return row?.total ?? 0;
}

export async function recordSuggestionRequest(db: Db, params: { userId: string }): Promise<void> {
  await db.insert(suggestionRequests).values({ userId: params.userId });
}
