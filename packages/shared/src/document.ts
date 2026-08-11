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
