import type { Tier } from '@alvus-ai/shared';
import type { Db } from '../db/client';
import { getMonthlyLimit } from '../db/queries/tier-limits';
import { recordUsageEvent, sumUsage, type ActionType } from '../db/queries/usage';
import { AppError } from '../../middleware/errors';

export type { ActionType } from '../db/queries/usage';

// There is no `subscriptions` table yet (that's US-023/024's Stripe billing
// work per docs/data-model.md) -- until then no account can be on a paid
// plan, so every user is on `free` by definition. Same call as
// routes/admin.ts's `toAdminUser`; once billing lands this becomes a lookup
// against `subscriptions.tier`.
export function resolveTier(): Tier {
  return 'free';
}

// First-of-month UTC, calendar-month for all tiers (docs/data-model.md).
export function currentBillingPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function nextBillingPeriodStart(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const next = new Date(Date.UTC(year, month + 1, 1));
  return next.toISOString();
}

export type UsageLimitStatus = {
  allowed: boolean;
  limit: number | null;
  used: number;
  resetsAt: string;
};

// Checked before every metered action (source analysis, feedback pass) --
// never after the expensive AI call. A `null` limit means unlimited (no v1
// tier uses this).
export async function checkUsageLimit(
  db: Db,
  params: { userId: string; actionType: ActionType; now: Date },
): Promise<UsageLimitStatus> {
  const tier = resolveTier();
  const billingPeriod = currentBillingPeriod(params.now);
  const [limit, used] = await Promise.all([
    getMonthlyLimit(db, { tier, actionType: params.actionType }),
    sumUsage(db, { userId: params.userId, actionType: params.actionType, billingPeriod }),
  ]);
  const resetsAt = nextBillingPeriodStart(params.now);
  return { allowed: limit === null || used < limit, limit, used, resetsAt };
}

// Throws the standard 402 `usage_limit_exceeded` envelope (docs/api.md's
// cross-cutting rules) if the caller's quota for `actionType` is exhausted;
// returns silently otherwise. Callers check this before doing the expensive
// AI work, per docs/tdd.md's Flow 1 step 6a.
export async function assertWithinUsageLimit(db: Db, params: { userId: string; actionType: ActionType; now: Date }): Promise<void> {
  const status = await checkUsageLimit(db, params);
  if (!status.allowed) {
    throw new AppError(402, 'usage_limit_exceeded', 'You have reached your monthly limit for this action on your current plan.', {
      limit: status.limit,
      used: status.used,
      resets_at: status.resetsAt,
    });
  }
}

// Recorded only on success (docs/tdd.md's Flow 1 step 6c) -- a failed AI call
// never counts against the user's quota.
export async function recordUsage(
  db: Db,
  params: {
    userId: string;
    projectId?: string | null;
    actionType: ActionType;
    now: Date;
    tokenCostInput?: number | null;
    tokenCostOutput?: number | null;
    metadata?: unknown;
  },
): Promise<void> {
  await recordUsageEvent(db, {
    userId: params.userId,
    projectId: params.projectId,
    actionType: params.actionType,
    billingPeriod: currentBillingPeriod(params.now),
    tokenCostInput: params.tokenCostInput,
    tokenCostOutput: params.tokenCostOutput,
    metadata: params.metadata,
  });
}
