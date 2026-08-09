import { describe, expect, it } from 'vitest';
import { searchSources } from './index';

// No SOURCES_PROVIDER_MODE set -- exercises fixture mode exactly as CI/local
// dev do by default (see fixtures.ts's isLiveMode). No network call happens.
const ENV = {};

describe('searchSources (fixture mode)', () => {
  it('merges and dedupes the normal fixture set, resolving OA status for each candidate', async () => {
    const result = await searchSources({ query: 'climate rhetoric' }, ENV);

    expect(result.providersUnreachable).toBe(false);
    expect(result.candidates.map((c) => c.title)).toEqual([
      'Climate Policy Rhetoric in the 21st Century',
      'Discourse Analysis Methods in Policy Studies',
      'Rhetorical Strategies in Environmental Advocacy',
    ]);

    const climate = result.candidates.find((c) => c.doi === '10.1234/climate-2020');
    expect(climate?.oaStatus).toBe('gold'); // resolved directly from Semantic Scholar's openAccessPdf

    const rhetoric = result.candidates.find((c) => c.doi === '10.1234/rhetoric-2019');
    expect(rhetoric?.oaStatus).toBe('green'); // CrossRef-only DOI, resolved via Unpaywall fixture

    const discourse = result.candidates.find((c) => c.doi === null);
    expect(discourse?.oaStatus).toBeNull(); // no DOI, no OA signal available
  });

  it('returns an empty, valid result for a query matched to the empty fixture set', async () => {
    const result = await searchSources({ query: 'zzz-empty query' }, ENV);
    expect(result).toEqual({ candidates: [], providersUnreachable: false });
  });

  it('reports providersUnreachable when every provider fails', async () => {
    const result = await searchSources({ query: 'zzz-error query' }, ENV);
    expect(result).toEqual({ candidates: [], providersUnreachable: true });
  });

  it('applies open_access_only, year_range, and limit filters', async () => {
    const openAccessOnly = await searchSources({ query: 'climate rhetoric', openAccessOnly: true }, ENV);
    expect(openAccessOnly.candidates.every((c) => c.oaStatus !== null)).toBe(true);
    expect(openAccessOnly.candidates).toHaveLength(2);

    const yearFiltered = await searchSources({ query: 'climate rhetoric', yearRange: [2019, 2019] }, ENV);
    expect(yearFiltered.candidates.map((c) => c.year)).toEqual([2019]);

    const limited = await searchSources({ query: 'climate rhetoric', limit: 1 }, ENV);
    expect(limited.candidates).toHaveLength(1);
  });
});
