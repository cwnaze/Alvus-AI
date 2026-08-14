import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { subscriptions } from '../schema';

export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function getSubscriptionByUserId(db: Db, userId: string): Promise<SubscriptionRow | null> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return row ?? null;
}

// One row per user (see schema/subscriptions.ts) -- upserted on the unique
// `user_id` constraint so a repeat call (e.g. re-confirming the same checkout
// success redirect) is idempotent rather than erroring on a duplicate insert.
export async function upsertSubscription(
  db: Db,
  params: {
    userId: string;
    tier: SubscriptionTier;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  },
): Promise<SubscriptionRow> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId: params.userId,
      tier: params.tier,
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      status: params.status,
      currentPeriodStart: params.currentPeriodStart,
      currentPeriodEnd: params.currentPeriodEnd,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        tier: params.tier,
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error('upsertSubscription: insert/update returned no row');
  return row;
}
