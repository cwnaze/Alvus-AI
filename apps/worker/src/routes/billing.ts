import type { BillingStatusResponse, CheckoutSessionResponse, PaidTier, PortalSessionResponse } from '@alvus-ai/shared';
import { PAID_TIERS } from '@alvus-ai/shared';
import { Hono } from 'hono';
import Stripe from 'stripe';
import { createDb } from '../lib/db/client';
import { getSubscriptionByUserId } from '../lib/db/queries/subscriptions';
import { checkUsageLimit } from '../lib/metering';
import { confirmCheckoutSession } from '../lib/stripe/checkout';
import { createStripeClient } from '../lib/stripe/client';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';

export type BillingBindings = AuthBindings & {
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID_PLUS: string;
  STRIPE_PRICE_ID_PRO: string;
};

type Env = { Bindings: BillingBindings; Variables: AuthVariables };

const billing = new Hono<Env>();
billing.use('*', authenticate, requireApproved);

function priceIdForTier(env: BillingBindings, tier: PaidTier): string {
  return tier === 'plus' ? env.STRIPE_PRICE_ID_PLUS : env.STRIPE_PRICE_ID_PRO;
}

function requestOrigin(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin;
}

billing.get('/status', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);

  const sessionId = c.req.query('session_id');
  if (sessionId) {
    const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
    await confirmCheckoutSession(stripe, db, { sessionId, userId: authUser.id });
  }

  const now = new Date();
  const [subscription, sourceAnalysis, feedbackPass] = await Promise.all([
    getSubscriptionByUserId(db, authUser.id),
    checkUsageLimit(db, { userId: authUser.id, actionType: 'source_analysis', now }),
    checkUsageLimit(db, { userId: authUser.id, actionType: 'feedback_pass', now }),
  ]);

  const response: BillingStatusResponse = {
    tier: subscription?.tier ?? 'free',
    subscription_status: subscription?.status ?? null,
    usage: {
      source_analysis: { used: sourceAnalysis.used, limit: sourceAnalysis.limit },
      feedback_pass: { used: feedbackPass.used, limit: feedbackPass.limit },
    },
    // Both calls share the same `now`, so the reset boundary is identical --
    // taking either is fine.
    renews_at: sourceAnalysis.resetsAt,
  };
  return c.json(response, 200);
});

billing.post('/checkout-session', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const body = (await c.req.json().catch(() => null)) as { tier?: unknown } | null;
  const tier = body?.tier;
  if (typeof tier !== 'string' || !PAID_TIERS.includes(tier as PaidTier)) {
    throw new AppError(400, 'invalid_tier', `tier must be one of ${PAID_TIERS.join(', ')}`);
  }

  const db = createDb(c.env.DATABASE_URL);
  const subscription = await getSubscriptionByUserId(db, authUser.id);
  if (subscription && subscription.tier === tier && (subscription.status === 'active' || subscription.status === 'trialing')) {
    throw new AppError(409, 'already_subscribed', `You are already subscribed to the ${tier} plan`);
  }

  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const origin = requestOrigin(c);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: authUser.id,
      ...(subscription?.stripeCustomerId ? { customer: subscription.stripeCustomerId } : { customer_email: authUser.email }),
      line_items: [{ price: priceIdForTier(c.env, tier as PaidTier), quantity: 1 }],
      metadata: { tier, user_id: authUser.id },
      success_url: `${origin}/usage?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/usage`,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      throw new AppError(502, 'stripe_error', 'Could not start checkout with Stripe. Please try again later.');
    }
    throw err;
  }

  if (!session.url) throw new AppError(502, 'stripe_error', 'Stripe did not return a Checkout URL');
  const response: CheckoutSessionResponse = { url: session.url };
  return c.json(response, 200);
});

billing.post('/portal-session', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const subscription = await getSubscriptionByUserId(db, authUser.id);
  if (!subscription?.stripeCustomerId) {
    throw new AppError(404, 'no_stripe_customer', 'No billing account found -- start a subscription first');
  }

  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const origin = requestOrigin(c);
  let session: Stripe.BillingPortal.Session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/usage`,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      throw new AppError(502, 'stripe_error', 'Could not open the billing portal. Please try again later.');
    }
    throw err;
  }

  const response: PortalSessionResponse = { url: session.url };
  return c.json(response, 200);
});

export default billing;
