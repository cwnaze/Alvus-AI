import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCrossref } from './crossref';
import { ProviderError } from './types';

const LIVE_ENV = { SOURCES_PROVIDER_MODE: 'live' };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('searchCrossref (live mode retry policy)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers from a transient 502 by retrying and returns the eventual result', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, { message: { items: [{ DOI: '10.1/x', title: ['Retried Paper'] }] } }));

    const result = await searchCrossref('climate rhetoric', LIVE_ENV);

    expect(result).toEqual([expect.objectContaining({ title: 'Retried Paper' })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a ProviderError once the retry budget is exhausted against a persistent outage', async () => {
    fetchMock.mockRejectedValue(new TypeError('network error'));

    await expect(searchCrossref('climate rhetoric', LIVE_ENV)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not retry a 400 -- fails fast with a single request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400));

    await expect(searchCrossref('climate rhetoric', LIVE_ENV)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
