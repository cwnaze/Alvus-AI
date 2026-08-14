import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRELATION_ID_HEADER, onError } from '../middleware/errors';
import type { AuthBindings, AuthVariables } from '../middleware/auth';

type ErrorEnvelope = { error: { code: string; message: string; correlationId: string } };

const { getUser, getUserById, checkUsageLimit, getSubscriptionByUserId, upsertSubscription, stripeCheckoutCreate, stripeCheckoutRetrieve, stripePortalCreate } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getUserById: vi.fn(),
    checkUsageLimit: vi.fn(),
    getSubscriptionByUserId: vi.fn(),
    upsertSubscription: vi.fn(),
    stripeCheckoutCreate: vi.fn(),
    stripeCheckoutRetrieve: vi.fn(),
    stripePortalCreate: vi.fn(),
  }));

vi.mock('../lib/supabase/client', () => ({
  createSupabaseAdmin: () => ({ auth: { getUser } }),
}));
vi.mock('../lib/db/client', () => ({ createDb: () => ({}) }));
vi.mock('../lib/db/queries/waitlist', () => ({ getUserById }));
vi.mock('../lib/metering', () => ({ checkUsageLimit }));
vi.mock('../lib/db/queries/subscriptions', () => ({ getSubscriptionByUserId, upsertSubscription }));
vi.mock('../lib/stripe/client', () => ({
  createStripeClient: () => ({
    checkout: { sessions: { create: stripeCheckoutCreate, retrieve: stripeCheckoutRetrieve } },
    billingPortal: { sessions: { create: stripePortalCreate } },
  }),
}));

const { default: billingRoutes } = await import('./billing');

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();
app.use('*', requestId({ headerName: CORRELATION_ID_HEADER }));
app.onError(onError);
app.route('/', billingRoutes);

const ENV = {
  DATABASE_URL: 'unused',
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SECRET_KEY: 'secret',
  STRIPE_SECRET_KEY: 'sk_test_unused',
  STRIPE_PRICE_ID_PLUS: 'price_plus',
  STRIPE_PRICE_ID_PRO: 'price_pro',
};
const USER_ID = 'user-1';

function callerRow(overrides: Partial<{ id: string; status: string; role: string; email: string }> = {}) {
  return {
    id: overrides.id ?? USER_ID,
    email: overrides.email ?? 'user@example.test',
    status: overrides.status ?? 'approved',
    role: overrides.role ?? 'member',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function asCaller(overrides?: Parameters<typeof callerRow>[0]) {
  getUser.mockResolvedValueOnce({ data: { user: { id: overrides?.id ?? USER_ID } }, error: null });
  getUserById.mockResolvedValueOnce(callerRow(overrides));
}

function request(path: string, init?: RequestInit) {
  return app.request(path, { ...init, headers: { Authorization: 'Bearer tok', ...init?.headers } }, ENV);
}

beforeEach(() => {
  vi.clearAllMocks();
  checkUsageLimit.mockResolvedValue({ allowed: true, limit: 5, used: 0, resetsAt: '2026-02-01T00:00:00.000Z' });
});

describe('GET /status', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/status', undefined, ENV);
    expect(res.status).toBe(401);
  });

  it('403s a pending caller', async () => {
    asCaller({ status: 'pending' });
    const res = await request('/status');
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('waitlist_pending');
  });

  it('reports "free" with a null subscription_status when no subscription row exists', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);

    const res = await request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as BillingStatusBody;
    expect(body.tier).toBe('free');
    expect(body.subscription_status).toBeNull();
  });

  it('reports the tier and status off an existing subscription row', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active' });

    const res = await request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as BillingStatusBody;
    expect(body.tier).toBe('plus');
    expect(body.subscription_status).toBe('active');
  });

  it('confirms a checkout session and upserts the subscription before reporting status when session_id is present', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active' });
    stripeCheckoutRetrieve.mockResolvedValueOnce({
      client_reference_id: USER_ID,
      payment_status: 'paid',
      customer: 'cus_123',
      metadata: { tier: 'plus' },
      subscription: {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ current_period_start: 1740000000, current_period_end: 1742678400 }] },
      },
    });

    const res = await request('/status?session_id=cs_test_123');

    expect(res.status).toBe(200);
    expect(stripeCheckoutRetrieve).toHaveBeenCalledWith('cs_test_123', { expand: ['subscription'] });
    expect(upsertSubscription).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: USER_ID, tier: 'plus', stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123', status: 'active' }),
    );
  });

  it('ignores a checkout session belonging to a different user', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutRetrieve.mockResolvedValueOnce({ client_reference_id: 'someone-else', payment_status: 'paid' });

    const res = await request('/status?session_id=cs_test_123');

    expect(res.status).toBe(200);
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('ignores an unpaid checkout session', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutRetrieve.mockResolvedValueOnce({ client_reference_id: USER_ID, payment_status: 'unpaid' });

    const res = await request('/status?session_id=cs_test_123');

    expect(res.status).toBe(200);
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('ignores a session_id Stripe rejects rather than failing the whole request', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutRetrieve.mockRejectedValueOnce(new Error('No such checkout session'));

    const res = await request('/status?session_id=cs_bogus');

    expect(res.status).toBe(200);
    expect(upsertSubscription).not.toHaveBeenCalled();
  });
});

describe('POST /checkout-session', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'plus' }) }, ENV);
    expect(res.status).toBe(401);
  });

  it('400s an invalid tier', async () => {
    asCaller();
    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'free' }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('invalid_tier');
  });

  it('409s a duplicate checkout for the tier the user is already on', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active', stripeCustomerId: 'cus_123' });

    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'plus' }) });

    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('already_subscribed');
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Checkout Session by email for a caller with no Stripe customer yet', async () => {
    asCaller({ email: 'new-subscriber@example.test' });
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/pay/cs_test_123' });

    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'plus' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_123' });
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        client_reference_id: USER_ID,
        customer_email: 'new-subscriber@example.test',
        line_items: [{ price: 'price_plus', quantity: 1 }],
        success_url: 'http://localhost/usage?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost/usage',
      }),
    );
  });

  it('reuses the existing Stripe customer id when switching tiers', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active', stripeCustomerId: 'cus_existing' });
    stripeCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/pay/cs_test_456' });

    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'pro' }) });

    expect(res.status).toBe(200);
    expect(stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing', line_items: [{ price: 'price_pro', quantity: 1 }] }),
    );
  });

  it('502s when Stripe returns no Checkout URL', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutCreate.mockResolvedValueOnce({ url: null });

    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'plus' }) });

    expect(res.status).toBe(502);
  });

  it('502s with a clean error when Stripe itself rejects the request', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    stripeCheckoutCreate.mockRejectedValueOnce(
      Stripe.errors.generateV1Error({ type: 'invalid_request_error', message: 'you must set an account or business name' }),
    );

    const res = await request('/checkout-session', { method: 'POST', body: JSON.stringify({ tier: 'plus' }) });

    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('stripe_error');
  });
});

describe('POST /portal-session', () => {
  it('401s an unauthenticated caller', async () => {
    const res = await app.request('/portal-session', { method: 'POST', body: JSON.stringify({}) }, ENV);
    expect(res.status).toBe(401);
  });

  it('404s when the caller has no Stripe customer yet', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce(null);

    const res = await request('/portal-session', { method: 'POST', body: JSON.stringify({}) });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('no_stripe_customer');
  });

  it('creates a Billing Portal session for an existing Stripe customer', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active', stripeCustomerId: 'cus_123' });
    stripePortalCreate.mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session/test_abc' });

    const res = await request('/portal-session', { method: 'POST', body: JSON.stringify({}) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/session/test_abc' });
    expect(stripePortalCreate).toHaveBeenCalledWith({ customer: 'cus_123', return_url: 'http://localhost/usage' });
  });

  it('502s with a clean error when Stripe itself rejects the portal session request', async () => {
    asCaller();
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus', status: 'active', stripeCustomerId: 'cus_123' });
    stripePortalCreate.mockRejectedValueOnce(Stripe.errors.generateV1Error({ type: 'invalid_request_error', message: 'no default configuration' }));

    const res = await request('/portal-session', { method: 'POST', body: JSON.stringify({}) });

    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe('stripe_error');
  });
});

type BillingStatusBody = {
  tier: string;
  subscription_status: string | null;
  usage: Record<string, { used: number; limit: number | null }>;
  renews_at: string;
};
