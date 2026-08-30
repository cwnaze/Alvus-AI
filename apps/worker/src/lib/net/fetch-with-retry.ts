export type RetryFetchOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  retryOnStatus?: (status: number) => boolean;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thrown when an attempt is aborted by the per-attempt timeout, distinct from
// a network-level failure so callers/logs can tell "provider never answered"
// apart from "connection refused".
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Wraps `fetch` with an explicit per-attempt timeout and exponential-backoff
// retries for transient failures (timeout, network error, 5xx). A non-2xx
// response that isn't retryable (4xx) is returned as-is on the first attempt
// -- it's the caller's job to turn that into a domain error, and retrying it
// would just burn the retry budget on a request that will never succeed.
// Read-only GET calls, so a retried attempt is naturally safe to repeat; it
// never writes or charges anything itself (see the callers in lib/sources
// and lib/ai for where usage is actually recorded, exactly once, after the
// whole call -- retries included -- resolves).
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: RetryFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryOnStatus = options.retryOnStatus ?? isRetryableStatus;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const isLastAttempt = attempt >= maxRetries;

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!response.ok && retryOnStatus(response.status) && !isLastAttempt) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      const error = timedOut ? new TimeoutError(`Request to ${String(input)} timed out after ${timeoutMs}ms`) : err;
      if (isLastAttempt) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
}
