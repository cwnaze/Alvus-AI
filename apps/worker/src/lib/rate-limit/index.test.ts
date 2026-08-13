import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../middleware/errors';

const { countSuggestionRequestsSince, recordSuggestionRequest } = vi.hoisted(() => ({
  countSuggestionRequestsSince: vi.fn(),
  recordSuggestionRequest: vi.fn(),
}));

vi.mock('../db/queries/suggestion-requests', () => ({ countSuggestionRequestsSince, recordSuggestionRequest }));

const { assertWithinSuggestionRateLimit, recordSuggestionRequestHit } = await import('./index');

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
