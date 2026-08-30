import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, fetchWithRetry } from './fetch-with-retry';

// Every test overrides baseDelayMs to ~1ms -- real timers, no fake-timer
// dependency, kept fast without asserting exact backoff durations.
const FAST = { baseDelayMs: 1 };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

function hangingUntilAborted(): (input: unknown, init?: RequestInit) => Promise<Response> {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
}

describe('fetchWithRetry', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the response on a first-try success without retrying', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await fetchWithRetry('https://example.test', {}, FAST);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx response with backoff and returns the eventual success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503)).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await fetchWithRetry('https://example.test', {}, { ...FAST, maxRetries: 2 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx response -- returns it immediately', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404));

    const res = await fetchWithRetry('https://example.test', {}, { ...FAST, maxRetries: 2 });

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network error and returns the eventual success', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network error')).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await fetchWithRetry('https://example.test', {}, { ...FAST, maxRetries: 2 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and returns the last failing response rather than retrying forever', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    const res = await fetchWithRetry('https://example.test', {}, { ...FAST, maxRetries: 2 });

    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('aborts a hung request after the per-attempt timeout and throws TimeoutError once retries are exhausted', async () => {
    fetchMock.mockImplementation(hangingUntilAborted());

    await expect(fetchWithRetry('https://example.test', {}, { ...FAST, timeoutMs: 5, maxRetries: 1 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('propagates a non-retryable thrown error once retries are exhausted', async () => {
    fetchMock.mockRejectedValue(new TypeError('network error'));

    await expect(fetchWithRetry('https://example.test', {}, { ...FAST, maxRetries: 1 })).rejects.toThrow('network error');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
