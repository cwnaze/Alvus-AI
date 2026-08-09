import type { CitationFormat } from './citation';

export const OA_STATUSES = ['gold', 'green', 'hybrid', 'bronze', 'closed'] as const;
export type OaStatus = (typeof OA_STATUSES)[number];

// Mirrors the JSON wire contract in docs/api.md's Source discovery section.
export type SourceCandidate = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  oa_status: OaStatus | null;
};

export type SourceSearchResponse = {
  candidates: SourceCandidate[];
  count: number;
};

export const SOURCE_STATES = ['candidate', 'selected', 'rejected'] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

export const FULL_TEXT_STATUSES = ['open_access', 'abstract_only'] as const;
export type FullTextStatus = (typeof FULL_TEXT_STATUSES)[number];

export type KeyQuote = {
  quote: string;
  location: string;
  usage_suggestion: string;
};

export type SourceAnalysis = {
  citation: string;
  summary: { strengths: string; weaknesses: string };
  usefulness_score: number;
  key_quotes: KeyQuote[];
  full_text_status: FullTextStatus;
  analyzed_at: string;
};

// A source as returned by the list/detail endpoints -- SourceCandidate's
// fields plus lifecycle state and analysis (once it exists).
export type ProjectSource = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  oa_status: OaStatus | null;
  state: SourceState;
  analysis: SourceAnalysis | null;
};

export type ProjectSourcesResponse = {
  sources: ProjectSource[];
};

export type SourceStateResponse = {
  state: SourceState;
};

export type BibliographyEntry = {
  source_id: string;
  citation_text: string;
};

export type BibliographyResponse = {
  citation_format: CitationFormat;
  entries: BibliographyEntry[];
};
