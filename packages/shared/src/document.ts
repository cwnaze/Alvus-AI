// TipTap/ProseMirror JSON doc -- opaque to everything outside the editor
// itself (docs/data-model.md's `project_documents.content`).
export type DocumentContent = Record<string, unknown>;

export type ProjectDocumentResponse = {
  content: DocumentContent;
  updated_at: string;
};

export type SaveDocumentResponse = {
  updated_at: string;
};

// A citation node's `sourceId` no longer resolves to a `selected`
// project_source -- deleted, deselected, or rejected since it was inserted.
export type DanglingCitation = {
  source_id: string;
};

export type DocumentFormatResponse = {
  content: DocumentContent;
  dangling_citations: DanglingCitation[];
};

export type SuggestionsResponse = {
  suggestions: string[];
};
