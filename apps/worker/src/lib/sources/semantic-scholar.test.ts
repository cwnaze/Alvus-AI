import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchSemanticScholar } from './semantic-scholar';
import { ProviderError } from './types';

const LIVE_ENV = { SOURCES_PROVIDER_MODE: 'live' };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('searchSemanticScholar (live mode retry policy)', () => {
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
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ paperId: '1', title: 'Retried Paper' }] }));

    const result = await searchSemanticScholar('climate rhetoric', LIVE_ENV);

    expect(result).toEqual([expect.objectContaining({ title: 'Retried Paper' })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a ProviderError once the retry budget is exhausted against a persistent outage', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    await expect(searchSemanticScholar('climate rhetoric', LIVE_ENV)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // proves it actually retried, not a bare single call
  });

  it('does not retry a 404 -- fails fast with a single request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404));

    await expect(searchSemanticScholar('climate rhetoric', LIVE_ENV)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
