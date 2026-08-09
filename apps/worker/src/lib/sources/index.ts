import { searchCrossref } from './crossref';
import { mergeCandidates } from './merge';
import { searchSemanticScholar } from './semantic-scholar';
import type { MergedCandidate, SourcesEnv } from './types';
import { resolveOaStatus } from './unpaywall';

export type SearchSourcesParams = {
  query: string;
  yearRange?: [number, number];
  openAccessOnly?: boolean;
  limit?: number;
};

export type SearchSourcesResult = {
  candidates: MergedCandidate[];
  providersUnreachable: boolean;
};

const DEFAULT_LIMIT = 20;

function withinYearRange(candidate: MergedCandidate, range?: [number, number]): boolean {
  if (!range) return true;
  if (candidate.year === null) return false;
  return candidate.year >= range[0] && candidate.year <= range[1];
}

// Queries Semantic Scholar + CrossRef in parallel, merges/dedupes by DOI (see
// merge.ts), then resolves OA status via Unpaywall for any DOI-bearing
// candidate that didn't already get one from Semantic Scholar directly.
// One provider failing degrades gracefully to the other's results;
// `providersUnreachable` is only true when *both* failed, per docs/api.md's
// "502 all providers unreachable".
export async function searchSources(params: SearchSourcesParams, env: SourcesEnv): Promise<SearchSourcesResult> {
  const [semanticScholarResult, crossrefResult] = await Promise.allSettled([
    searchSemanticScholar(params.query, env),
    searchCrossref(params.query, env),
  ]);

  if (semanticScholarResult.status === 'rejected' && crossrefResult.status === 'rejected') {
    return { candidates: [], providersUnreachable: true };
  }

  const semanticScholarCandidates = semanticScholarResult.status === 'fulfilled' ? semanticScholarResult.value : [];
  const crossrefCandidates = crossrefResult.status === 'fulfilled' ? crossrefResult.value : [];
  const merged = mergeCandidates(semanticScholarCandidates, crossrefCandidates);

  const withOaStatus = await Promise.all(
    merged.map(async (candidate) => {
      if (candidate.oaStatus !== null || candidate.doi === null) return candidate;
      const oa = await resolveOaStatus(candidate.doi, env);
      return oa ? { ...candidate, oaStatus: oa.status, oaUrl: oa.url } : candidate;
    }),
  );

  const filtered = withOaStatus
    .filter((c) => withinYearRange(c, params.yearRange))
    .filter((c) => !params.openAccessOnly || c.oaStatus !== null)
    .slice(0, params.limit ?? DEFAULT_LIMIT);

  return { candidates: filtered, providersUnreachable: false };
}
