import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOaStatus } from './unpaywall';

const LIVE_ENV = { SOURCES_PROVIDER_MODE: 'live' };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('resolveOaStatus (live mode retry policy)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers from a transient 503 by retrying and returns the eventual result', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200, { is_oa: true, oa_status: 'green', best_oa_location: { url: 'https://oa.test/x.pdf' } }));

    const result = await resolveOaStatus('10.1/x', LIVE_ENV);

    expect(result).toEqual({ status: 'green', url: 'https://oa.test/x.pdf' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is best-effort: returns null (never throws) once its retry budget is exhausted', async () => {
    fetchMock.mockRejectedValue(new TypeError('network error'));

    const result = await resolveOaStatus('10.1/x', LIVE_ENV);

    expect(result).toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // still proves it retried before giving up
  });
});
