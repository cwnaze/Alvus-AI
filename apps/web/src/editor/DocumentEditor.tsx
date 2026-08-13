import type { DocumentContent } from '@alvus-ai/shared';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { Citation } from './citationExtension';
import { FeedbackHighlight } from './feedbackHighlightExtension';

type DocumentEditorProps = {
  initialContent: DocumentContent;
  onChange: (content: DocumentContent) => void;
  onEditorReady?: (editor: Editor) => void;
};

function ToolbarButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded border px-2 py-1 text-sm ${active ? 'border-brand bg-brand text-white' : 'border-slate-300 text-slate-700'}`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex gap-2 border-b border-slate-200 pb-2">
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton
        label="Heading"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
    </div>
  );
}

// Mounted only once the project's document has loaded (see WritingPage, which
// keys this by projectId to force a remount on project change), so
// `initialContent` seeds the editor once per instance and is never fed back in
// -- TipTap owns the document after that; edits flow out via `onChange`, never back in.
export default function DocumentEditor({ initialContent, onChange, onEditorReady }: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Citation, FeedbackHighlight],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[60vh] rounded border border-slate-200 px-4 py-3 focus:outline-none ' +
          '[&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_p]:my-2',
        'data-testid': 'document-editor',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocumentContent),
  });

  const onEditorReadyRef = useRef(onEditorReady);
  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  });
  useEffect(() => {
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-3">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
