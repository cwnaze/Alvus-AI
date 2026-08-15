import type Stripe from 'stripe';
import type { Db } from '../db/client';
import { upsertSubscription, type SubscriptionStatus } from '../db/queries/subscriptions';

export const KNOWN_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'];

// Shared by the success-redirect confirmation (`GET /billing/status?session_id=`) and
// the `checkout.session.completed` webhook (US-024) -- both ultimately need the same
// "retrieve the session, validate it, upsert the subscription" steps, just triggered
// differently (best-effort UX speedup vs. the reliable webhook delivery). A session
// that fails any check here is silently ignored: the caller just sees whatever the DB
// already had, same as if `sessionId` had never been passed.
export async function confirmCheckoutSession(stripe: Stripe, db: Db, params: { sessionId: string; userId: string }): Promise<void> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(params.sessionId, { expand: ['subscription'] });
  } catch {
    return;
  }
  if (session.client_reference_id !== params.userId) return;
  if (session.payment_status !== 'paid') return;

  const subscription = session.subscription;
  if (!subscription || typeof subscription === 'string') return;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) return;

  const tier = session.metadata?.tier;
  if (tier !== 'plus' && tier !== 'pro') return;

  const item = subscription.items.data[0];
  if (!item) return;
  const status: SubscriptionStatus = KNOWN_SUBSCRIPTION_STATUSES.includes(subscription.status as SubscriptionStatus)
    ? (subscription.status as SubscriptionStatus)
    : 'active';

  await upsertSubscription(db, {
    userId: params.userId,
    tier,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status,
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
