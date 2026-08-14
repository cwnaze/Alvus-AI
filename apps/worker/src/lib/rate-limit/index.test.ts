import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../middleware/errors';

const { countSuggestionRequestsSince, recordSuggestionRequest, countShareLinkLookupsSince, recordShareLinkLookup } = vi.hoisted(() => ({
  countSuggestionRequestsSince: vi.fn(),
  recordSuggestionRequest: vi.fn(),
  countShareLinkLookupsSince: vi.fn(),
  recordShareLinkLookup: vi.fn(),
}));

vi.mock('../db/queries/suggestion-requests', () => ({ countSuggestionRequestsSince, recordSuggestionRequest }));
vi.mock('../db/queries/share-link-lookups', () => ({ countShareLinkLookupsSince, recordShareLinkLookup }));

const { assertWithinSuggestionRateLimit, recordSuggestionRequestHit, assertWithinShareLinkLookupRateLimit, recordShareLinkLookupHit } =
  await import('./index');

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
