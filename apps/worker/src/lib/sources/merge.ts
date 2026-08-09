import type { MergedCandidate, RawCandidate } from './types';

function normalizedTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(candidate: RawCandidate): string {
  return candidate.doi ? `doi:${candidate.doi}` : `title:${normalizedTitle(candidate.title)}`;
}

// Prefers the richer (Semantic Scholar) field when both providers found the
// same work, falling back to CrossRef's -- CrossRef never has an abstract or
// semanticScholarId, so those always come from `a` (Semantic Scholar) when set.
function mergeFields(a: RawCandidate, b: RawCandidate): MergedCandidate {
  return {
    doi: a.doi ?? b.doi,
    semanticScholarId: a.semanticScholarId ?? b.semanticScholarId,
    title: a.title || b.title,
    authors: a.authors.length ? a.authors : b.authors,
    abstract: a.abstract ?? b.abstract,
    year: a.year ?? b.year,
    venue: a.venue ?? b.venue,
    oaStatus: a.oaStatus ?? b.oaStatus,
    oaUrl: a.oaUrl ?? b.oaUrl,
  };
}

// Merges Semantic Scholar + CrossRef results into one deduped candidate list,
// keyed by DOI (case/whitespace-normalized) and falling back to normalized
// title for DOI-less works. Order: Semantic Scholar's results first, then any
// CrossRef-only additions, each in their original order.
export function mergeCandidates(semanticScholar: RawCandidate[], crossref: RawCandidate[]): MergedCandidate[] {
  const byKey = new Map<string, MergedCandidate>();
  const order: string[] = [];

  for (const candidate of [...semanticScholar, ...crossref]) {
    const key = dedupeKey(candidate);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, mergeFields(existing, candidate));
    } else {
      byKey.set(key, candidate);
      order.push(key);
    }
  }

  return order.map((key) => byKey.get(key)!);
}
