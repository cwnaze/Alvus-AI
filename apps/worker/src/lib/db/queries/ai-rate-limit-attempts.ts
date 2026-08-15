import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { aiRateLimitAttempts } from '../schema';

// Sliding window: count rows since `since` rather than a mutable counter,
// same read-side shape as countSuggestionRequestsSince.
export async function countAiRateLimitAttemptsSince(
  db: Db,
  params: { userId: string; actionType: string; since: Date },
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(aiRateLimitAttempts)
    .where(
      and(
        eq(aiRateLimitAttempts.userId, params.userId),
        eq(aiRateLimitAttempts.actionType, params.actionType),
        gte(aiRateLimitAttempts.createdAt, params.since),
      ),
    );
  return row?.total ?? 0;
}

export async function recordAiRateLimitAttempt(db: Db, params: { userId: string; actionType: string }): Promise<void> {
  await db.insert(aiRateLimitAttempts).values(params);
}
