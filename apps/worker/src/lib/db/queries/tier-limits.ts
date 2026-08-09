import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import { tierLimits } from '../schema';
import type { ActionType } from './usage';

// `null` monthlyLimit means unlimited (no v1 tier uses this, see
// docs/data-model.md); returning `null` from this function (row not found)
// is treated the same way by lib/metering -- fail open rather than block on a
// missing config row.
export async function getMonthlyLimit(
  db: Db,
  params: { tier: 'free' | 'plus' | 'pro'; actionType: ActionType },
): Promise<number | null> {
  const [row] = await db
    .select()
    .from(tierLimits)
    .where(and(eq(tierLimits.tier, params.tier), eq(tierLimits.actionType, params.actionType)));
  return row ? row.monthlyLimit : null;
}
