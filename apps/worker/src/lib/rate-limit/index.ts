import type { Db } from '../db/client';
import { countAiRateLimitAttemptsSince, recordAiRateLimitAttempt } from '../db/queries/ai-rate-limit-attempts';
import { countAuthRateLimitAttemptsSince, recordAuthRateLimitAttempt } from '../db/queries/auth-rate-limit-attempts';
import { countShareLinkLookupsSince, recordShareLinkLookup } from '../db/queries/share-link-lookups';
import { countSuggestionRequestsSince, recordSuggestionRequest } from '../db/queries/suggestion-requests';
import type { ActionType } from '../db/queries/usage';
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

// Secondary layer behind the share-link token's own entropy (docs/security.md's
// "Share-link brute force/leak" threat note lists "rate-limit lookups"
// alongside entropy and revocation) -- generous enough that visitors behind a
// shared/NAT'd IP legitimately reloading a paper don't get caught, but tight
// enough to meaningfully slow a scripted scan of the token space.
const SHARE_LINK_LOOKUP_WINDOW_MS = 60_000;
const MAX_SHARE_LINK_LOOKUPS_PER_WINDOW = 30;

export async function assertWithinShareLinkLookupRateLimit(db: Db, params: { ipAddress: string; now: Date }): Promise<void> {
  const since = new Date(params.now.getTime() - SHARE_LINK_LOOKUP_WINDOW_MS);
  const count = await countShareLinkLookupsSince(db, { ipAddress: params.ipAddress, since });
  if (count >= MAX_SHARE_LINK_LOOKUPS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil(SHARE_LINK_LOOKUP_WINDOW_MS / 1000);
    throw new AppError(
      429,
      'rate_limited',
      'Too many share link requests. Please slow down and try again shortly.',
      { retry_after: retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

// Recorded for every lookup attempt regardless of outcome (unknown/revoked/
// valid token) -- same reasoning as recordSuggestionRequestHit: the limit
// caps attempts, so a scan of invalid tokens must still trip it.
export async function recordShareLinkLookupHit(db: Db, params: { ipAddress: string }): Promise<void> {
  await recordShareLinkLookup(db, params);
}

// Per-IP abuse guard on the public, unauthenticated auth endpoints (US-027's
// first AC) -- separate from Supabase Auth's own rate limiting (e.g.
// resetPasswordForEmail's 429, still surfaced by routes/auth.ts), this is the
// app's own floor so signup/login/password-reset can't be hammered faster
// than a human regardless of what GoTrue itself allows. Each endpoint gets
// its own window so a burst against one doesn't lock out the others.
//
// Thresholds are sized the same way share-link-lookup's are (see that
// comment below): generous enough that a shared/NAT'd IP -- which in
// practice includes this repo's own e2e regression suite, all 15 browser
// specs running sequentially from one machine (measured: 14 signups, 48
// logins per full run) -- never trips them, while still capping sustained
// abuse to a small fraction of unrestricted throughput.
export type AuthRateLimitEndpoint = 'signup' | 'login' | 'password_reset_request';

const AUTH_RATE_LIMITS: Record<AuthRateLimitEndpoint, { windowMs: number; maxRequests: number }> = {
  signup: { windowMs: 10 * 60_000, maxRequests: 50 },
  login: { windowMs: 10 * 60_000, maxRequests: 150 },
  password_reset_request: { windowMs: 10 * 60_000, maxRequests: 30 },
};

export async function assertWithinAuthRateLimit(
  db: Db,
  params: { ipAddress: string; endpoint: AuthRateLimitEndpoint; now: Date },
): Promise<void> {
  const { windowMs, maxRequests } = AUTH_RATE_LIMITS[params.endpoint];
  const since = new Date(params.now.getTime() - windowMs);
  const count = await countAuthRateLimitAttemptsSince(db, { ipAddress: params.ipAddress, endpoint: params.endpoint, since });
  if (count >= maxRequests) {
    const retryAfterSeconds = Math.ceil(windowMs / 1000);
    throw new AppError(
      429,
      'rate_limited',
      'Too many requests. Please try again shortly.',
      { retry_after: retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

// Recorded for every attempt that clears the check regardless of outcome
// (wrong password, duplicate email, unknown address) -- same reasoning as
// recordSuggestionRequestHit: the limit caps attempts, not successes.
export async function recordAuthRateLimitHit(db: Db, params: { ipAddress: string; endpoint: AuthRateLimitEndpoint }): Promise<void> {
  await recordAuthRateLimitAttempt(db, params);
}

// Per-user abuse guard on the AI-cost-bearing endpoints (US-027's second AC)
// -- layered *in addition to* lib/metering's tier-quota check: quota caps
// spend over a billing period, this caps burst rate within a minute, so a
// script can't front-load an entire month's quota in a tight loop even while
// nominally within it.
const AI_RATE_LIMIT_WINDOW_MS = 60_000;
const AI_RATE_LIMIT_MAX_REQUESTS = 5;

export async function assertWithinAiRateLimit(db: Db, params: { userId: string; actionType: ActionType; now: Date }): Promise<void> {
  const since = new Date(params.now.getTime() - AI_RATE_LIMIT_WINDOW_MS);
  const count = await countAiRateLimitAttemptsSince(db, { userId: params.userId, actionType: params.actionType, since });
  if (count >= AI_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(AI_RATE_LIMIT_WINDOW_MS / 1000);
    throw new AppError(
      429,
      'rate_limited',
      'Too many requests. Please slow down and try again shortly.',
      { retry_after: retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }
}

// Recorded for every request that clears the check regardless of whether the
// downstream AI call itself later succeeds -- same reasoning as
// recordSuggestionRequestHit.
export async function recordAiRateLimitHit(db: Db, params: { userId: string; actionType: ActionType }): Promise<void> {
  await recordAiRateLimitAttempt(db, params);
}
