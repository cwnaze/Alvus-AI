import type { BibliographyEntry, CitationFormat, DocumentContent } from '@alvus-ai/shared';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Citation } from './citationExtension';

const FORMAT_LABEL: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };
const BIBLIOGRAPHY_HEADING: Record<CitationFormat, string> = { mla: 'Works Cited', apa: 'References', chicago: 'Bibliography' };

type DocumentPreviewProps = {
  content: DocumentContent;
  citationFormat: CitationFormat;
  projectTitle: string;
  bibliography: BibliographyEntry[];
};

// The full assembled paper (docs/tdd.md Flow 2: "headers/margins/running
// heads/bibliography page assembled client-side from the TipTap doc + format
// ruleset"), rendered read-only from a point-in-time snapshot -- the content
// as of the last "Render full document" action, not a live view of the editor.
export default function DocumentPreview({ content, citationFormat, projectTitle, bibliography }: DocumentPreviewProps) {
  const editor = useEditor({
    extensions: [StarterKit, Citation],
    content,
    editable: false,
    immediatelyRender: false,
  });

  const sortedEntries = [...bibliography].sort((a, b) => a.citation_text.localeCompare(b.citation_text));

  return (
    <div data-testid="document-preview" className="mx-auto max-w-2xl border border-slate-300 bg-white px-12 py-10 shadow-sm">
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-2 text-xs text-slate-500">
        <span>{projectTitle}</span>
        <span>{FORMAT_LABEL[citationFormat]} format · Page 1</span>
      </div>
      {editor && <EditorContent editor={editor} />}
      <h2 className="mt-10 text-base font-semibold" data-testid="bibliography-page-heading">
        {BIBLIOGRAPHY_HEADING[citationFormat]}
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {sortedEntries.map((entry) => (
          <li key={entry.source_id} data-testid={`preview-bibliography-${entry.source_id}`}>
            {entry.citation_text}
          </li>
        ))}
      </ul>
    </div>
  );
}
