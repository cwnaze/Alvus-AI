export type OaStatus = 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';

// Normalized shape both provider clients return in, before merge/dedupe.
export type RawCandidate = {
  doi: string | null;
  semanticScholarId: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  oaStatus: OaStatus | null;
  oaUrl: string | null;
};

export type MergedCandidate = RawCandidate;

export type SourcesEnv = {
  SOURCES_PROVIDER_MODE?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  CROSSREF_CONTACT_EMAIL?: string;
  UNPAYWALL_CONTACT_EMAIL?: string;
};

// Thrown by a provider client when its call fails outright (network error,
// non-2xx, malformed body) -- the caller decides whether one provider
// failing is tolerable (the other's results still stand) or, if every
// provider failed, whether to surface it as a 502.
export class ProviderError extends Error {
  constructor(
    public provider: 'semantic_scholar' | 'crossref' | 'unpaywall',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
