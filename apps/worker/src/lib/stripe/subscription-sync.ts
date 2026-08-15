import type Stripe from 'stripe';
import type { Db } from '../db/client';
import { updateSubscriptionByStripeSubscriptionId, type SubscriptionStatus, type SubscriptionTier } from '../db/queries/subscriptions';
import { KNOWN_SUBSCRIPTION_STATUSES } from './checkout';

export type PriceIdBindings = { STRIPE_PRICE_ID_PLUS: string; STRIPE_PRICE_ID_PRO: string };

function tierForPriceId(env: PriceIdBindings, priceId: string | undefined): SubscriptionTier | undefined {
  if (priceId === env.STRIPE_PRICE_ID_PLUS) return 'plus';
  if (priceId === env.STRIPE_PRICE_ID_PRO) return 'pro';
  return undefined;
}

// Drives `customer.subscription.created/updated/deleted` (US-024). Stripe's
// `canceled`/`unpaid` (our schema has no `unpaid` -- see docs/data-model.md --
// so it's folded into `canceled`, the terminal state we already model) are the
// only statuses that downgrade the tier to `free`; every other status
// (active, trialing, past_due, incomplete...) keeps whatever tier the price
// id maps to, so a payment failure alone (which Stripe reflects as
// `past_due`, not `canceled`) never loses paid access -- the grace period the
// story's AC requires.
export async function syncSubscriptionFromStripe(db: Db, env: PriceIdBindings, subscription: Stripe.Subscription): Promise<void> {
  const item = subscription.items.data[0];
  if (!item) return;

  const isTerminal = subscription.status === 'canceled' || subscription.status === 'unpaid';
  const status: SubscriptionStatus = isTerminal
    ? 'canceled'
    : KNOWN_SUBSCRIPTION_STATUSES.includes(subscription.status as SubscriptionStatus)
      ? (subscription.status as SubscriptionStatus)
      : 'active';
  const tier: SubscriptionTier | undefined = isTerminal ? 'free' : tierForPriceId(env, item.price?.id);

  await updateSubscriptionByStripeSubscriptionId(db, {
    stripeSubscriptionId: subscription.id,
    tier,
    status,
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
