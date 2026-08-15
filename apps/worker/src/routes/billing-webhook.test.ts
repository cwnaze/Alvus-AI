import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError, type ErrorVariables } from '../middleware/errors';
import type { BillingWebhookBindings } from './billing-webhook';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { confirmCheckoutSession, syncSubscriptionFromStripe } = vi.hoisted(() => ({
  confirmCheckoutSession: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(),
}));

vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/stripe/checkout', async () => {
  const actual = await vi.importActual<typeof import('../lib/stripe/checkout')>('../lib/stripe/checkout');
  return { ...actual, confirmCheckoutSession };
});
vi.mock('../lib/stripe/subscription-sync', () => ({ syncSubscriptionFromStripe }));

const { default: billingWebhookRoutes } = await import('./billing-webhook');

const app = new Hono<{ Bindings: BillingWebhookBindings; Variables: ErrorVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', billingWebhookRoutes);

const WEBHOOK_SECRET = 'whsec_test_secret';
const ENV = {
  DATABASE_URL: 'unused',
  STRIPE_SECRET_KEY: 'sk_test_unused',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_ID_PLUS: 'price_plus',
  STRIPE_PRICE_ID_PRO: 'price_pro',
};

// A real Stripe client (no network calls made by webhook signing/verification)
// so the signature check in the route under test runs for real, per
// docs/testing.md: "webhook handling is proven by constructing a signed
// fixture event and POSTing it directly to the Worker route".
const signingClient = new Stripe('sk_test_unused', { httpClient: Stripe.createFetchHttpClient() });

async function signedRequest(event: unknown, opts: { secret?: string } = {}) {
  const payload = JSON.stringify(event);
  const signature = await signingClient.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: opts.secret ?? WEBHOOK_SECRET,
  });
  return app.request('/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }, ENV);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /webhook', () => {
  it('400s when the Stripe-Signature header is missing', async () => {
    const res = await app.request('/webhook', { method: 'POST', body: '{}' }, ENV);
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_signature');
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
  });

  it('400s and processes nothing when the signature does not match the payload', async () => {
    const res = await signedRequest({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } }, { secret: 'whsec_wrong' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_signature');
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('links the initiating user via client_reference_id on checkout.session.completed', async () => {
    const res = await signedRequest({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', client_reference_id: 'user-1', metadata: { tier: 'plus' } } },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(confirmCheckoutSession).toHaveBeenCalledWith(expect.anything(), {}, { sessionId: 'cs_test_123', userId: 'user-1' });
  });

  it('falls back to metadata.user_id when client_reference_id is absent', async () => {
    const res = await signedRequest({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', client_reference_id: null, metadata: { tier: 'plus', user_id: 'user-2' } } },
    });

    expect(res.status).toBe(200);
    expect(confirmCheckoutSession).toHaveBeenCalledWith(expect.anything(), {}, { sessionId: 'cs_test_123', userId: 'user-2' });
  });

  it('does not attempt to link a session with no user id at all', async () => {
    const res = await signedRequest({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', client_reference_id: null, metadata: {} } },
    });

    expect(res.status).toBe(200);
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
  });

  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])(
    'syncs subscription state on %s',
    async (type) => {
      const subscription = { id: 'sub_123', status: 'active', cancel_at_period_end: false, items: { data: [{ price: { id: 'price_plus' }, current_period_start: 1740000000, current_period_end: 1742678400 }] } };

      const res = await signedRequest({ id: 'evt_1', type, data: { object: subscription } });

      expect(res.status).toBe(200);
      expect(syncSubscriptionFromStripe).toHaveBeenCalledWith({}, ENV, subscription);
    },
  );

  it('does not downgrade the user on invoice.payment_failed (grace period)', async () => {
    const res = await signedRequest({
      id: 'evt_1',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_123', subscription: 'sub_123' } },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('acknowledges but ignores an event type not in the registered set', async () => {
    const res = await signedRequest({ id: 'evt_1', type: 'customer.updated', data: { object: {} } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(confirmCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });
});
