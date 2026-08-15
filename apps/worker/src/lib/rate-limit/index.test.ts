import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../middleware/errors';

const {
  countSuggestionRequestsSince,
  recordSuggestionRequest,
  countShareLinkLookupsSince,
  recordShareLinkLookup,
  countAuthRateLimitAttemptsSince,
  recordAuthRateLimitAttempt,
  countAiRateLimitAttemptsSince,
  recordAiRateLimitAttempt,
} = vi.hoisted(() => ({
  countSuggestionRequestsSince: vi.fn(),
  recordSuggestionRequest: vi.fn(),
  countShareLinkLookupsSince: vi.fn(),
  recordShareLinkLookup: vi.fn(),
  countAuthRateLimitAttemptsSince: vi.fn(),
  recordAuthRateLimitAttempt: vi.fn(),
  countAiRateLimitAttemptsSince: vi.fn(),
  recordAiRateLimitAttempt: vi.fn(),
}));

vi.mock('../db/queries/suggestion-requests', () => ({ countSuggestionRequestsSince, recordSuggestionRequest }));
vi.mock('../db/queries/share-link-lookups', () => ({ countShareLinkLookupsSince, recordShareLinkLookup }));
vi.mock('../db/queries/auth-rate-limit-attempts', () => ({ countAuthRateLimitAttemptsSince, recordAuthRateLimitAttempt }));
vi.mock('../db/queries/ai-rate-limit-attempts', () => ({ countAiRateLimitAttemptsSince, recordAiRateLimitAttempt }));

const {
  assertWithinSuggestionRateLimit,
  recordSuggestionRequestHit,
  assertWithinShareLinkLookupRateLimit,
  recordShareLinkLookupHit,
  assertWithinAuthRateLimit,
  recordAuthRateLimitHit,
  assertWithinAiRateLimit,
  recordAiRateLimitHit,
} = await import('./index');

const DB = {} as never;
const USER_ID = 'user-1';
const NOW = new Date('2026-03-15T12:00:00Z');

describe('assertWithinSuggestionRateLimit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves silently when under the window ceiling', async () => {
    countSuggestionRequestsSince.mockResolvedValueOnce(3);
    await expect(assertWithinSuggestionRateLimit(DB, { userId: USER_ID, now: NOW })).resolves.toBeUndefined();
  });

  it('throws a 429 rate_limited AppError with a Retry-After header once at the ceiling', async () => {
    countSuggestionRequestsSince.mockResolvedValueOnce(10);

    try {
      await assertWithinSuggestionRateLimit(DB, { userId: USER_ID, now: NOW });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(429);
      expect(appErr.code).toBe('rate_limited');
      expect(appErr.headers?.['Retry-After']).toBeTruthy();
    }
  });

  it('queries the count using a since-window derived from now', async () => {
    countSuggestionRequestsSince.mockResolvedValueOnce(0);
    await assertWithinSuggestionRateLimit(DB, { userId: USER_ID, now: NOW });
    expect(countSuggestionRequestsSince).toHaveBeenCalledWith(DB, { userId: USER_ID, since: new Date('2026-03-15T11:59:00.000Z') });
  });
});

describe('recordSuggestionRequestHit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a hit for the user', async () => {
    await recordSuggestionRequestHit(DB, { userId: USER_ID });
    expect(recordSuggestionRequest).toHaveBeenCalledWith(DB, { userId: USER_ID });
  });
});

const IP_ADDRESS = '203.0.113.7';

describe('assertWithinShareLinkLookupRateLimit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves silently when under the window ceiling', async () => {
    countShareLinkLookupsSince.mockResolvedValueOnce(5);
    await expect(assertWithinShareLinkLookupRateLimit(DB, { ipAddress: IP_ADDRESS, now: NOW })).resolves.toBeUndefined();
  });

  it('throws a 429 rate_limited AppError with a Retry-After header once at the ceiling', async () => {
    countShareLinkLookupsSince.mockResolvedValueOnce(30);

    try {
      await assertWithinShareLinkLookupRateLimit(DB, { ipAddress: IP_ADDRESS, now: NOW });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(429);
      expect(appErr.code).toBe('rate_limited');
      expect(appErr.headers?.['Retry-After']).toBeTruthy();
    }
  });

  it('queries the count using a since-window derived from now', async () => {
    countShareLinkLookupsSince.mockResolvedValueOnce(0);
    await assertWithinShareLinkLookupRateLimit(DB, { ipAddress: IP_ADDRESS, now: NOW });
    expect(countShareLinkLookupsSince).toHaveBeenCalledWith(DB, { ipAddress: IP_ADDRESS, since: new Date('2026-03-15T11:59:00.000Z') });
  });
});

describe('recordShareLinkLookupHit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a hit for the IP address', async () => {
    await recordShareLinkLookupHit(DB, { ipAddress: IP_ADDRESS });
    expect(recordShareLinkLookup).toHaveBeenCalledWith(DB, { ipAddress: IP_ADDRESS });
  });
});

describe('assertWithinAuthRateLimit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves silently when under the window ceiling', async () => {
    countAuthRateLimitAttemptsSince.mockResolvedValueOnce(2);
    await expect(assertWithinAuthRateLimit(DB, { ipAddress: IP_ADDRESS, endpoint: 'login', now: NOW })).resolves.toBeUndefined();
  });

  it('throws a 429 rate_limited AppError with a Retry-After header once at the ceiling', async () => {
    countAuthRateLimitAttemptsSince.mockResolvedValueOnce(150);

    try {
      await assertWithinAuthRateLimit(DB, { ipAddress: IP_ADDRESS, endpoint: 'login', now: NOW });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(429);
      expect(appErr.code).toBe('rate_limited');
      expect(appErr.headers?.['Retry-After']).toBeTruthy();
    }
  });

  it('scopes the window count by endpoint, not just IP', async () => {
    countAuthRateLimitAttemptsSince.mockResolvedValueOnce(0);
    await assertWithinAuthRateLimit(DB, { ipAddress: IP_ADDRESS, endpoint: 'signup', now: NOW });
    expect(countAuthRateLimitAttemptsSince).toHaveBeenCalledWith(DB, {
      ipAddress: IP_ADDRESS,
      endpoint: 'signup',
      since: new Date('2026-03-15T11:50:00.000Z'),
    });
  });
});

describe('recordAuthRateLimitHit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a hit for the IP address and endpoint', async () => {
    await recordAuthRateLimitHit(DB, { ipAddress: IP_ADDRESS, endpoint: 'login' });
    expect(recordAuthRateLimitAttempt).toHaveBeenCalledWith(DB, { ipAddress: IP_ADDRESS, endpoint: 'login' });
  });
});

describe('assertWithinAiRateLimit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves silently when under the window ceiling', async () => {
    countAiRateLimitAttemptsSince.mockResolvedValueOnce(2);
    await expect(assertWithinAiRateLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW })).resolves.toBeUndefined();
  });

  it('throws a 429 rate_limited AppError with a Retry-After header once at the ceiling', async () => {
    countAiRateLimitAttemptsSince.mockResolvedValueOnce(5);

    try {
      await assertWithinAiRateLimit(DB, { userId: USER_ID, actionType: 'source_analysis', now: NOW });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(429);
      expect(appErr.code).toBe('rate_limited');
      expect(appErr.headers?.['Retry-After']).toBeTruthy();
    }
  });

  it('scopes the window count by action type, not just user', async () => {
    countAiRateLimitAttemptsSince.mockResolvedValueOnce(0);
    await assertWithinAiRateLimit(DB, { userId: USER_ID, actionType: 'feedback_pass', now: NOW });
    expect(countAiRateLimitAttemptsSince).toHaveBeenCalledWith(DB, {
      userId: USER_ID,
      actionType: 'feedback_pass',
      since: new Date('2026-03-15T11:59:00.000Z'),
    });
  });
});

describe('recordAiRateLimitHit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a hit for the user and action type', async () => {
    await recordAiRateLimitHit(DB, { userId: USER_ID, actionType: 'source_analysis' });
    expect(recordAiRateLimitAttempt).toHaveBeenCalledWith(DB, { userId: USER_ID, actionType: 'source_analysis' });
  });
});
