import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { authRateLimitAttempts } from '../schema';

// Sliding window: count rows since `since` rather than a mutable counter,
// same read-side shape as countSuggestionRequestsSince/countShareLinkLookupsSince.
export async function countAuthRateLimitAttemptsSince(
  db: Db,
  params: { ipAddress: string; endpoint: string; since: Date },
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(authRateLimitAttempts)
    .where(
      and(
        eq(authRateLimitAttempts.ipAddress, params.ipAddress),
        eq(authRateLimitAttempts.endpoint, params.endpoint),
        gte(authRateLimitAttempts.createdAt, params.since),
      ),
    );
  return row?.total ?? 0;
}

export async function recordAuthRateLimitAttempt(db: Db, params: { ipAddress: string; endpoint: string }): Promise<void> {
  await db.insert(authRateLimitAttempts).values(params);
}
