import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertSubscription } = vi.hoisted(() => ({
  upsertSubscription: vi.fn(),
}));

vi.mock('../db/queries/subscriptions', async () => {
  const actual = await vi.importActual<typeof import('../db/queries/subscriptions')>('../db/queries/subscriptions');
  return { ...actual, upsertSubscription };
});

const { confirmCheckoutSession } = await import('./checkout');

function session(overrides: Record<string, unknown> = {}) {
  return {
    client_reference_id: null,
    payment_status: 'paid',
    customer: 'cus_123',
    metadata: { tier: 'plus' },
    subscription: {
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: 1740000000, current_period_end: 1742678400 }] },
    },
    ...overrides,
  };
}

function stripeClient(sessionResult: unknown) {
  return { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(sessionResult) } } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmCheckoutSession', () => {
  it('upserts the subscription when client_reference_id matches the caller', async () => {
    const stripe = stripeClient(session({ client_reference_id: 'user-1' }));

    await confirmCheckoutSession(stripe, {} as never, { sessionId: 'cs_test_123', userId: 'user-1' });

    expect(upsertSubscription).toHaveBeenCalledWith({}, expect.objectContaining({ userId: 'user-1', tier: 'plus', stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123' }));
  });

  it('upserts the subscription when only metadata.user_id matches the caller -- the webhook fallback path', async () => {
    const stripe = stripeClient(session({ client_reference_id: null, metadata: { tier: 'plus', user_id: 'user-2' } }));

    await confirmCheckoutSession(stripe, {} as never, { sessionId: 'cs_test_123', userId: 'user-2' });

    expect(upsertSubscription).toHaveBeenCalledWith({}, expect.objectContaining({ userId: 'user-2', tier: 'plus', stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123' }));
  });

  it('ignores a session whose client_reference_id and metadata.user_id both belong to someone else', async () => {
    const stripe = stripeClient(session({ client_reference_id: 'someone-else', metadata: { tier: 'plus', user_id: 'someone-else' } }));

    await confirmCheckoutSession(stripe, {} as never, { sessionId: 'cs_test_123', userId: 'user-1' });

    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('ignores an unpaid session', async () => {
    const stripe = stripeClient(session({ client_reference_id: 'user-1', payment_status: 'unpaid' }));

    await confirmCheckoutSession(stripe, {} as never, { sessionId: 'cs_test_123', userId: 'user-1' });

    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('is a no-op when Stripe rejects the session id', async () => {
    const stripe = { checkout: { sessions: { retrieve: vi.fn().mockRejectedValue(new Error('No such checkout session')) } } } as never;

    await confirmCheckoutSession(stripe, {} as never, { sessionId: 'cs_bogus', userId: 'user-1' });

    expect(upsertSubscription).not.toHaveBeenCalled();
  });
});
