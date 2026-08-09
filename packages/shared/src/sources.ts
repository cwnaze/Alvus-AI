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
