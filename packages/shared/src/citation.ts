export const CITATION_FORMATS = ['mla', 'apa', 'chicago'] as const;

export type CitationFormat = (typeof CITATION_FORMATS)[number];
