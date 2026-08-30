import { fetchWithRetry } from '../net/fetch-with-retry';
import { crossrefFixture, fixtureKindForQuery, isLiveMode } from './fixtures';
import { ProviderError, type RawCandidate, type SourcesEnv } from './types';

const API_BASE = 'https://api.crossref.org/works';

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
};

type CrossrefResponse = { message?: { items?: CrossrefItem[] } };

function authorName(author: { given?: string; family?: string }): string | null {
  const name = [author.given, author.family].filter(Boolean).join(' ').trim();
  return name || null;
}

function toRawCandidate(item: CrossrefItem): RawCandidate | null {
  const title = item.title?.[0];
  if (!title) return null;
  return {
    doi: item.DOI?.trim().toLowerCase() || null,
    semanticScholarId: null,
    title,
    authors: (item.author ?? []).map(authorName).filter((n): n is string => !!n),
    abstract: null,
    year: item.published?.['date-parts']?.[0]?.[0] ?? null,
    venue: item['container-title']?.[0] ?? null,
    // CrossRef doesn't report OA status -- resolved separately via Unpaywall
    // for any DOI-bearing candidate that didn't already get one from
    // Semantic Scholar (see index.ts).
    oaStatus: null,
    oaUrl: null,
  };
}

export async function searchCrossref(query: string, env: SourcesEnv): Promise<RawCandidate[]> {
  if (!isLiveMode(env)) {
    const fixture = crossrefFixture(fixtureKindForQuery(query)) as { httpStatus?: number } & CrossrefResponse;
    if (fixture.httpStatus) throw new ProviderError('crossref', `CrossRef fixture error (status ${fixture.httpStatus})`);
    return (fixture.message?.items ?? []).map(toRawCandidate).filter((c): c is RawCandidate => c !== null);
  }

  const url = new URL(API_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('rows', '20');
  if (env.CROSSREF_CONTACT_EMAIL) url.searchParams.set('mailto', env.CROSSREF_CONTACT_EMAIL);

  let res: Response;
  try {
    res = await fetchWithRetry(url);
  } catch (err) {
    throw new ProviderError('crossref', err instanceof Error ? err.message : 'network error');
  }
  if (!res.ok) throw new ProviderError('crossref', `CrossRef returned ${res.status}`);

  const body = (await res.json()) as CrossrefResponse;
  return (body.message?.items ?? []).map(toRawCandidate).filter((c): c is RawCandidate => c !== null);
}
