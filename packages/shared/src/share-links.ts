import type { BibliographyEntry } from './sources';
import type { CitationFormat } from './citation';
import type { DocumentContent } from './document';

// Mirrors the JSON wire contract in docs/api.md's Share links section.
export type ShareLinkResponse = {
  token: string;
  url: string;
};

// Deliberately narrower than `Project` -- no `owner_id` or `status`, per
// docs/api.md's "read-only, no analysis internals" and docs/security.md's
// "never expose the owner's other projects".
export type SharedProject = {
  id: string;
  title: string;
  citation_format: CitationFormat;
};

export type SharedPaperResponse = {
  project: SharedProject;
  bibliography: BibliographyEntry[];
  document: {
    content: DocumentContent;
    updated_at: string;
  };
};
