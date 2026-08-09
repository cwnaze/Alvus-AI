import type { CitationFormat } from '@alvus-ai/shared';

// Deterministic formatting from a fixed set of model-supplied/known
// bibliographic fields (docs/tdd.md's Flow 1 step 6b: the LLM extracts/
// normalizes citation fields, `lib/citation` renders the string -- never the
// other way around, so the same fields always render the same string).
export type CitationFields = {
  authors: string[];
  title: string;
  year: number | null;
  venue: string | null;
};

const UNDATED = { mla: 'n.d.', apa: 'n.d.', chicago: 'n.d.' } as const;

// "Jane A. Doe" -> { first: "Jane A.", last: "Doe" }. Single-token names (e.g.
// an organization credited as one word) are treated as the "last" name with
// no first name, which degrades gracefully rather than throwing.
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { first: '', last: parts[0] ?? name };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] ?? '' };
}

function lastFirst(name: string): string {
  const { first, last } = splitName(name);
  return first ? `${last}, ${first}` : last;
}

function initials(first: string): string {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}.`)
    .join(' ');
}

function apaAuthor(name: string): string {
  const { first, last } = splitName(name);
  return first ? `${last}, ${initials(first)}` : last;
}

function formatAuthorsMla(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return lastFirst(authors[0]!);
  if (authors.length === 2) return `${lastFirst(authors[0]!)}, and ${authors[1]}`;
  return `${lastFirst(authors[0]!)}, et al.`;
}

function formatAuthorsApa(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return apaAuthor(authors[0]!);
  const formatted = authors.map(apaAuthor);
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
}

function formatAuthorsChicago(authors: string[]): string {
  // Chicago (notes-bibliography) inverts only the first author's name.
  if (authors.length === 0) return '';
  if (authors.length === 1) return lastFirst(authors[0]!);
  if (authors.length === 2) return `${lastFirst(authors[0]!)}, and ${authors[1]}`;
  return `${lastFirst(authors[0]!)} et al.`;
}

function formatMla(fields: CitationFields): string {
  const authors = formatAuthorsMla(fields.authors);
  const year = fields.year ?? UNDATED.mla;
  const segments = [authors, `"${fields.title}."`, fields.venue, year].filter(Boolean);
  return `${segments.join(', ')}.`;
}

function formatApa(fields: CitationFields): string {
  const authors = formatAuthorsApa(fields.authors);
  const year = fields.year ?? UNDATED.apa;
  const lead = authors ? `${authors} (${year}).` : `(${year}).`;
  const segments = [lead, `${fields.title}.`, fields.venue ? `${fields.venue}.` : null].filter(Boolean);
  return segments.join(' ');
}

function formatChicago(fields: CitationFields): string {
  const authors = formatAuthorsChicago(fields.authors);
  const year = fields.year ?? UNDATED.chicago;
  const venue = fields.venue ? `${fields.venue} (${year})` : year;
  const segments = [authors, `"${fields.title}."`, `${venue}.`].filter(Boolean);
  return segments.join(' ');
}

export function formatCitation(format: CitationFormat, fields: CitationFields): string {
  switch (format) {
    case 'mla':
      return formatMla(fields);
    case 'apa':
      return formatApa(fields);
    case 'chicago':
      return formatChicago(fields);
  }
}
