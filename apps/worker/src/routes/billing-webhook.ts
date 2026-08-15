import { Hono } from 'hono';
import type Stripe from 'stripe';
import { createDb } from '../lib/db/client';
import { confirmCheckoutSession } from '../lib/stripe/checkout';
import { createStripeClient } from '../lib/stripe/client';
import { syncSubscriptionFromStripe } from '../lib/stripe/subscription-sync';
import { AppError } from '../middleware/errors';

export type BillingWebhookBindings = {
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_PLUS: string;
  STRIPE_PRICE_ID_PRO: string;
};

type Env = { Bindings: BillingWebhookBindings };

// Deliberately its own router, mounted separately from `billing.ts` -- Stripe
// calls this unauthenticated (there's no user session to check), so it must
// never pick up `billing.ts`'s `authenticate`/`requireApproved` middleware.
// The `Stripe-Signature` check below is this route's actual auth.
const billingWebhook = new Hono<Env>();

// Registered in the Stripe Dashboard for exactly these five event types (see
// docs/api.md); anything else Stripe might send is acknowledged and ignored
// rather than erroring, since an unrecognized-but-harmless event type should
// never cause Stripe to retry.
billingWebhook.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) throw new AppError(400, 'invalid_signature', 'Missing Stripe-Signature header');

  const payload = await c.req.text();
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, c.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, 'invalid_signature', 'Invalid Stripe webhook signature');
  }

  const db = createDb(c.env.DATABASE_URL);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id ?? (typeof session.metadata?.user_id === 'string' ? session.metadata.user_id : null);
      if (userId) await confirmCheckoutSession(stripe, db, { sessionId: session.id, userId });
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscriptionFromStripe(db, c.env, event.data.object);
      break;
    }
    case 'invoice.payment_failed': {
      // Deliberately a no-op: Stripe independently transitions the
      // subscription to `past_due` and fires `customer.subscription.updated`
      // for that, which this route already syncs without touching `tier` --
      // that's the grace period. Downgrading happens only once Stripe later
      // reports the subscription `canceled`/`unpaid`.
      break;
    }
  }

  return c.json({ received: true }, 200);
});

export default billingWebhook;
