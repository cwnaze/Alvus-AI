import { fetchWithRetry } from '../net/fetch-with-retry';
import { fixtureKindForQuery, isLiveMode, semanticScholarFixture } from './fixtures';
import { ProviderError, type RawCandidate, type SourcesEnv } from './types';

const API_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';
const FIELDS = 'title,abstract,year,venue,authors,externalIds,openAccessPdf';

type SemanticScholarPaper = {
  paperId: string;
  title: string;
  abstract?: string | null;
  year?: number | null;
  venue?: string | null;
  authors?: Array<{ name?: string }>;
  externalIds?: { DOI?: string };
  openAccessPdf?: { url?: string; status?: string } | null;
};

type SemanticScholarResponse = { data?: SemanticScholarPaper[] };

function toRawCandidate(paper: SemanticScholarPaper): RawCandidate {
  const doi = paper.externalIds?.DOI?.trim().toLowerCase() || null;
  const oaUrl = paper.openAccessPdf?.url ?? null;
  return {
    doi,
    semanticScholarId: paper.paperId,
    title: paper.title,
    authors: (paper.authors ?? []).map((a) => a.name).filter((n): n is string => !!n),
    abstract: paper.abstract ?? null,
    year: paper.year ?? null,
    venue: paper.venue ?? null,
    // The public API doesn't grade OA color -- a resolvable PDF link is
    // treated as `gold` (best-effort; CrossRef-only candidates get a real
    // color from Unpaywall instead, see unpaywall.ts).
    oaStatus: oaUrl ? 'gold' : null,
    oaUrl,
  };
}

export async function searchSemanticScholar(query: string, env: SourcesEnv): Promise<RawCandidate[]> {
  if (!isLiveMode(env)) {
    const fixture = semanticScholarFixture(fixtureKindForQuery(query)) as { httpStatus?: number } & SemanticScholarResponse;
    if (fixture.httpStatus) throw new ProviderError('semantic_scholar', `Semantic Scholar fixture error (status ${fixture.httpStatus})`);
    return (fixture.data ?? []).map(toRawCandidate);
  }

  const url = new URL(API_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('limit', '20');

  const headers: Record<string, string> = {};
  if (env.SEMANTIC_SCHOLAR_API_KEY) headers['x-api-key'] = env.SEMANTIC_SCHOLAR_API_KEY;

  let res: Response;
  try {
    res = await fetchWithRetry(url, { headers });
  } catch (err) {
    throw new ProviderError('semantic_scholar', err instanceof Error ? err.message : 'network error');
  }
  if (!res.ok) throw new ProviderError('semantic_scholar', `Semantic Scholar returned ${res.status}`);

  const body = (await res.json()) as SemanticScholarResponse;
  return (body.data ?? []).map(toRawCandidate);
}
