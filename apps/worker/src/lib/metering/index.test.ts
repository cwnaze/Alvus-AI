import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../middleware/errors';

const { getMonthlyLimit, sumUsage, recordUsageEvent, getSubscriptionByUserId } = vi.hoisted(() => ({
  getMonthlyLimit: vi.fn(),
  sumUsage: vi.fn(),
  recordUsageEvent: vi.fn(),
  getSubscriptionByUserId: vi.fn(),
}));

vi.mock('../db/queries/tier-limits', () => ({ getMonthlyLimit }));
vi.mock('../db/queries/usage', () => ({ sumUsage, recordUsageEvent }));
vi.mock('../db/queries/subscriptions', () => ({ getSubscriptionByUserId }));

const { assertWithinUsageLimit, checkUsageLimit, currentBillingPeriod, recordUsage, resolveTier } = await import('./index');

const DB = {} as never;
const USER_ID = 'user-1';
const NOW = new Date('2026-03-15T12:00:00Z');

describe('resolveTier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is "free" when the user has no subscription row', async () => {
    getSubscriptionByUserId.mockResolvedValueOnce(null);
    expect(await resolveTier(DB, USER_ID)).toBe('free');
  });

  it('reads the tier off the subscription row when one exists', async () => {
    getSubscriptionByUserId.mockResolvedValueOnce({ tier: 'plus' });
    expect(await resolveTier(DB, USER_ID)).toBe('plus');
  });
});

describe('currentBillingPeriod', () => {
  it('is the first of the UTC month', () => {
    expect(currentBillingPeriod(new Date('2026-03-15T23:59:59Z'))).toBe('2026-03-01');
  });

  it('pads single-digit months', () => {
    expect(currentBillingPeriod(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-01');
  });
});

describe('checkUsageLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscriptionByUserId.mockResolvedValue(null);
  });

  it('allows the action when usage is under the limit', async () => {
    getMonthlyLimit.mockResolvedValueOnce(5);
    sumUsage.mockResolvedValueOnce(2);

    const status = await checkUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW });
    expect(status).toEqual({ allowed: true, limit: 5, used: 2, resetsAt: '2026-04-01T00:00:00.000Z' });
  });

  it('disallows the action once usage reaches the limit', async () => {
    getMonthlyLimit.mockResolvedValueOnce(5);
    sumUsage.mockResolvedValueOnce(5);

    const status = await checkUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW });
    expect(status.allowed).toBe(false);
  });

  it('always allows when the tier limit is unlimited (null)', async () => {
    getMonthlyLimit.mockResolvedValueOnce(null);
    sumUsage.mockResolvedValueOnce(1_000_000);

    const status = await checkUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW });
    expect(status.allowed).toBe(true);
  });
});

describe('assertWithinUsageLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscriptionByUserId.mockResolvedValue(null);
  });

  it('resolves silently when within the limit', async () => {
    getMonthlyLimit.mockResolvedValueOnce(5);
    sumUsage.mockResolvedValueOnce(0);
    await expect(assertWithinUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW })).resolves.toBeUndefined();
  });

  it('throws a 402 usage_limit_exceeded AppError once exhausted', async () => {
    getMonthlyLimit.mockResolvedValueOnce(5);
    sumUsage.mockResolvedValueOnce(5);

    await expect(assertWithinUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW })).rejects.toMatchObject({
      status: 402,
      code: 'usage_limit_exceeded',
    });
  });

  it('carries limit/used/resets_at meta on the thrown AppError', async () => {
    getMonthlyLimit.mockResolvedValueOnce(5);
    sumUsage.mockResolvedValueOnce(5);

    try {
      await assertWithinUsageLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.meta).toEqual({ limit: 5, used: 5, resets_at: '2026-04-01T00:00:00.000Z' });
    }
  });
});

describe('recordUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records the event for the current billing period', async () => {
    await recordUsage(DB, {
      userId: USER_ID,
      projectId: 'project-1',
      actionType: 'source_analysis',
      now: NOW,
      tokenCostInput: 100,
      tokenCostOutput: 50,
    });

    expect(recordUsageEvent).toHaveBeenCalledWith(DB, {
      userId: USER_ID,
      projectId: 'project-1',
      actionType: 'source_analysis',
      billingPeriod: '2026-03-01',
      tokenCostInput: 100,
      tokenCostOutput: 50,
      metadata: undefined,
    });
  });
});
