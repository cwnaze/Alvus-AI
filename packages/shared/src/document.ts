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

export const FEEDBACK_CATEGORIES = ['wording', 'phrasing', 'grammar', 'content'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

// `from`/`to` are raw ProseMirror positions computed at pass-time -- not
// re-validated against later edits (docs/data-model.md's acceptable v1
// limitation for `feedback_passes.comments`).
export type FeedbackAnchor = {
  from: number;
  to: number;
};

export type FeedbackComment = {
  id: string;
  anchor: FeedbackAnchor;
  category: FeedbackCategory;
  text: string;
};

export type FeedbackPassResponse = {
  pass_id: string;
  created_at: string;
  comments: FeedbackComment[];
};

export type FeedbackPassSummary = {
  pass_id: string;
  created_at: string;
  comment_count: number;
};

export type FeedbackPassesResponse = {
  passes: FeedbackPassSummary[];
  next_cursor: string | null;
};
