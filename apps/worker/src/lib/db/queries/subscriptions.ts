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

// Webhook-driven sync (US-024): `customer.subscription.*` events carry no
// user id, only the Stripe subscription id (the "webhook lookup key" per
// docs/data-model.md), so this updates in place rather than upserting.
// A `null` return means no linked row exists yet -- the caller should treat
// that as a no-op, since `checkout.session.completed`'s own handler creates
// the row (keyed by user id) independently and will fill it in regardless of
// event delivery order. `tier: undefined` leaves the stored tier untouched
// (used when the event's price id doesn't map to a known tier).
export async function updateSubscriptionByStripeSubscriptionId(
  db: Db,
  params: {
    stripeSubscriptionId: string;
    tier?: SubscriptionTier;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  },
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .update(subscriptions)
    .set({
      ...(params.tier ? { tier: params.tier } : {}),
      status: params.status,
      currentPeriodStart: params.currentPeriodStart,
      currentPeriodEnd: params.currentPeriodEnd,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, params.stripeSubscriptionId))
    .returning();
  return row ?? null;
}
