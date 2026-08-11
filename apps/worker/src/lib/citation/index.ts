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

// The parenthetical in-text form, distinct from `formatCitation`'s bibliography
// entry (docs/tdd.md Flow 2: "using the same rules as lib/citation ... always
// match" -- both draw on the same author-name helpers above). No page number:
// this app has no stable per-source pagination to draw one from (search
// results and uploads alike are analyzed from unpaginated text/abstracts), so
// MLA in-text citations omit it -- the same convention MLA itself uses for
// sources without fixed page numbers.
export type InTextCitationFields = {
  authors: string[];
  year: number | null;
};

function inTextAuthorsMla(authors: string[]): string {
  if (authors.length === 0) return '';
  const last = (name: string) => splitName(name).last;
  if (authors.length === 1) return last(authors[0]!);
  if (authors.length === 2) return `${last(authors[0]!)} and ${last(authors[1]!)}`;
  return `${last(authors[0]!)} et al.`;
}

function inTextAuthorsApa(authors: string[]): string {
  if (authors.length === 0) return '';
  const last = (name: string) => splitName(name).last;
  if (authors.length === 1) return last(authors[0]!);
  if (authors.length === 2) return `${last(authors[0]!)} & ${last(authors[1]!)}`;
  return `${last(authors[0]!)} et al.`;
}

function inTextAuthorsChicago(authors: string[]): string {
  if (authors.length === 0) return '';
  const last = (name: string) => splitName(name).last;
  if (authors.length === 1) return last(authors[0]!);
  if (authors.length === 2) return `${last(authors[0]!)} and ${last(authors[1]!)}`;
  return `${last(authors[0]!)} et al.`;
}

function formatInTextMla(fields: InTextCitationFields): string {
  const authors = inTextAuthorsMla(fields.authors);
  return `(${authors || UNDATED.mla})`;
}

function formatInTextApa(fields: InTextCitationFields): string {
  const authors = inTextAuthorsApa(fields.authors);
  const year = fields.year ?? UNDATED.apa;
  return authors ? `(${authors}, ${year})` : `(${year})`;
}

function formatInTextChicago(fields: InTextCitationFields): string {
  const authors = inTextAuthorsChicago(fields.authors);
  const year = fields.year ?? UNDATED.chicago;
  return authors ? `(${authors} ${year})` : `(${year})`;
}

// Chicago here is the author-date variant ("(Doe 2020)"), not
// notes-bibliography footnotes -- the editor has no footnote/endnote support,
// and author-date is a standard, citable Chicago style in its own right.
export function formatInTextCitation(format: CitationFormat, fields: InTextCitationFields): string {
  switch (format) {
    case 'mla':
      return formatInTextMla(fields);
    case 'apa':
      return formatInTextApa(fields);
    case 'chicago':
      return formatInTextChicago(fields);
  }
}
