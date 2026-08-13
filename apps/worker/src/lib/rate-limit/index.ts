import type { Db } from '../db/client';
import { countSuggestionRequestsSince, recordSuggestionRequest } from '../db/queries/suggestion-requests';
import { AppError } from '../../middleware/errors';

// Deliberately not routed through lib/metering -- a suggestion request isn't
// a tier-limited action (docs/api.md: "paragraph-start suggestions are not
// separately metered"), it's an abuse guard against a rapid-fire burst of
// requests to a lighter but still real AI call (docs/tdd.md Flow 2 step 3).
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

export async function assertWithinSuggestionRateLimit(db: Db, params: { userId: string; now: Date }): Promise<void> {
  const since = new Date(params.now.getTime() - WINDOW_MS);
  const count = await countSuggestionRequestsSince(db, { userId: params.userId, since });
  if (count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil(WINDOW_MS / 1000);
    throw new AppError(
      429,
      'rate_limited',
      'Too many suggestion requests. Please slow down and try again shortly.',
      { retry_after: retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

// Recorded for every request that clears the check, regardless of whether
// the downstream AI call itself later succeeds -- unlike metering (which
// only counts a successful action), the point of a rate limit is to cap
// attempts, so a burst of failing calls must still trip it.
export async function recordSuggestionRequestHit(db: Db, params: { userId: string }): Promise<void> {
  await recordSuggestionRequest(db, params);
}
