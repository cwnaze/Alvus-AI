import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { usageEvents } from '../schema';

export type ActionType = 'source_analysis' | 'feedback_pass';

// Limits are enforced by summing at read time (see docs/data-model.md's
// `usage_events`), not a mutable counter, so this is the entire read side of
// the limit check.
export async function sumUsage(db: Db, params: { userId: string; actionType: ActionType; billingPeriod: string }): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, params.userId),
        eq(usageEvents.actionType, params.actionType),
        eq(usageEvents.billingPeriod, params.billingPeriod),
      ),
    );
  return row?.total ?? 0;
}

export async function recordUsageEvent(
  db: Db,
  params: {
    userId: string;
    projectId?: string | null;
    actionType: ActionType;
    billingPeriod: string;
    tokenCostInput?: number | null;
    tokenCostOutput?: number | null;
    metadata?: unknown;
  },
): Promise<void> {
  await db.insert(usageEvents).values({
    userId: params.userId,
    projectId: params.projectId ?? null,
    actionType: params.actionType,
    billingPeriod: params.billingPeriod,
    tokenCostInput: params.tokenCostInput ?? null,
    tokenCostOutput: params.tokenCostOutput ?? null,
    metadata: params.metadata ?? null,
  });
}
