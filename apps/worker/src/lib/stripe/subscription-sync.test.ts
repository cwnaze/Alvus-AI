import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateSubscriptionByStripeSubscriptionId } = vi.hoisted(() => ({
  updateSubscriptionByStripeSubscriptionId: vi.fn(),
}));

vi.mock('../db/queries/subscriptions', () => ({ updateSubscriptionByStripeSubscriptionId }));

const { syncSubscriptionFromStripe } = await import('./subscription-sync');

const ENV = { STRIPE_PRICE_ID_PLUS: 'price_plus', STRIPE_PRICE_ID_PRO: 'price_pro' };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: { id: 'price_plus' }, current_period_start: 1740000000, current_period_end: 1742678400 }] },
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncSubscriptionFromStripe', () => {
  it('maps the price id to a tier and keeps a known status as-is', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ status: 'trialing' }));

    expect(updateSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        stripeSubscriptionId: 'sub_123',
        tier: 'plus',
        status: 'trialing',
        currentPeriodStart: new Date(1740000000 * 1000),
        currentPeriodEnd: new Date(1742678400 * 1000),
        cancelAtPeriodEnd: false,
      }),
    );
  });

  it('maps the pro price id', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ items: { data: [{ price: { id: 'price_pro' }, current_period_start: 1740000000, current_period_end: 1742678400 }] } }));

    expect(updateSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith({}, expect.objectContaining({ tier: 'pro' }));
  });

  it('keeps a past_due subscription active-tier -- payment-failure grace period', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ status: 'past_due' }));

    expect(updateSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tier: 'plus', status: 'past_due' }),
    );
  });

  it('downgrades to free and normalizes status to canceled when Stripe reports canceled', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ status: 'canceled' }));

    expect(updateSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tier: 'free', status: 'canceled' }),
    );
  });

  it('downgrades to free and normalizes status to canceled when Stripe reports unpaid', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ status: 'unpaid' }));

    expect(updateSubscriptionByStripeSubscriptionId).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tier: 'free', status: 'canceled' }),
    );
  });

  it('leaves tier unset when the price id does not map to a known tier', async () => {
    await syncSubscriptionFromStripe(
      {} as never,
      ENV,
      subscription({ items: { data: [{ price: { id: 'price_unknown' }, current_period_start: 1740000000, current_period_end: 1742678400 }] } }),
    );

    const call = updateSubscriptionByStripeSubscriptionId.mock.calls[0]?.[1];
    expect(call?.tier).toBeUndefined();
  });

  it('is a no-op when the subscription has no line items', async () => {
    await syncSubscriptionFromStripe({} as never, ENV, subscription({ items: { data: [] } }));

    expect(updateSubscriptionByStripeSubscriptionId).not.toHaveBeenCalled();
  });
});
