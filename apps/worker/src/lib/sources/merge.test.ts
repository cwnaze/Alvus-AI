import { describe, expect, it } from 'vitest';
import { mergeCandidates } from './merge';
import type { RawCandidate } from './types';

function candidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    doi: null,
    semanticScholarId: null,
    title: 'A Paper',
    authors: ['Author One'],
    abstract: null,
    year: 2020,
    venue: 'A Journal',
    oaStatus: null,
    oaUrl: null,
    ...overrides,
  };
}

describe('mergeCandidates', () => {
  it('dedupes by DOI, preferring Semantic Scholar fields', () => {
    const s2 = [candidate({ doi: '10.1/x', title: 'Rich Title', abstract: 'Has an abstract', semanticScholarId: 'S1' })];
    const crossref = [candidate({ doi: '10.1/x', title: 'Thin Title', venue: 'Crossref Venue' })];

    const merged = mergeCandidates(s2, crossref);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ title: 'Rich Title', abstract: 'Has an abstract', semanticScholarId: 'S1' });
  });

  it('fills gaps from CrossRef when Semantic Scholar lacks a field', () => {
    const s2 = [candidate({ doi: '10.1/x', abstract: null, venue: null })];
    const crossref = [candidate({ doi: '10.1/x', venue: 'Filled Venue' })];

    const merged = mergeCandidates(s2, crossref);

    expect(merged[0]?.venue).toBe('Filled Venue');
  });

  it('falls back to normalized title dedup when neither has a DOI', () => {
    const s2 = [candidate({ title: '  Same Title  ' })];
    const crossref = [candidate({ title: 'same title' })];

    const merged = mergeCandidates(s2, crossref);

    expect(merged).toHaveLength(1);
  });

  it('keeps distinct works separate and preserves discovery order', () => {
    const s2 = [candidate({ doi: '10.1/a', title: 'First' })];
    const crossref = [candidate({ doi: '10.1/b', title: 'Second' }), candidate({ doi: '10.1/a', title: 'First (dup)' })];

    const merged = mergeCandidates(s2, crossref);

    expect(merged.map((c) => c.title)).toEqual(['First', 'Second']);
  });

  it('returns an empty list when both providers found nothing', () => {
    expect(mergeCandidates([], [])).toEqual([]);
  });
});
