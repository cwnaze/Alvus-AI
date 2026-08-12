import type { BibliographyEntry, CitationFormat, DocumentContent, Project } from '@alvus-ai/shared';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DocumentEditor from '../editor/DocumentEditor';
import DocumentPreview from '../editor/DocumentPreview';
import { ApiError, fetchBibliography, fetchDocument, fetchProject, formatDocument, saveDocument } from '../lib/api';

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };

// Debounce autosave rather than saving on every keystroke -- formatting is
// deterministic client-side, so there's no AI call to justify per-keystroke
// requests, just a plain write that should coalesce rapid typing.
const AUTOSAVE_DELAY_MS = 800;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Failed to save',
};

function BibliographySidebar({ entries, onInsert }: { entries: BibliographyEntry[]; onInsert: (entry: BibliographyEntry) => void }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Select sources into your bibliography to cite them here.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.source_id} data-testid={`bibliography-sidebar-${entry.source_id}`} className="flex flex-col gap-2 rounded border border-slate-200 px-3 py-2">
          <span className="text-xs text-slate-600">{entry.citation_text}</span>
          <button
            type="button"
            onClick={() => onInsert(entry)}
            data-testid={`insert-citation-${entry.source_id}`}
            className="w-fit rounded border border-brand px-2 py-1 text-xs text-brand"
          >
            Insert citation
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function WritingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [docContent, setDocContent] = useState<DocumentContent | null>(null);
  const [bibliography, setBibliography] = useState<BibliographyEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const [renderVersion, setRenderVersion] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [danglingSourceIds, setDanglingSourceIds] = useState<string[]>([]);
  const [previewContent, setPreviewContent] = useState<DocumentContent | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef<DocumentContent | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all([fetchProject(projectId), fetchDocument(projectId), fetchBibliography(projectId)])
      .then(([proj, doc, bib]) => {
        if (cancelled) return;
        setProject(proj);
        setDocContent(doc.content);
        setBibliography(bib.entries);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load this document.');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (!saveTimeoutRef.current) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      const pending = latestContentRef.current;
      if (pending && projectId) void saveDocument(projectId, pending);
    };
  }, [projectId]);

  function scheduleSave(content: DocumentContent) {
    if (!projectId) return;
    latestContentRef.current = content;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const toSave = latestContentRef.current;
      if (!toSave) return;
      setSaveStatus('saving');
      try {
        await saveDocument(projectId, toSave);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  function insertCitation(entry: BibliographyEntry) {
    editorRef.current?.chain().focus().insertCitation({ sourceId: entry.source_id, text: entry.in_text_citation }).run();
  }

  // Cancels a pending debounced autosave and awaits it immediately, so callers that
  // need the server's persisted content to match what's in the editor (e.g. a
  // full-document render) can't race the 800ms debounce window.
  async function flushPendingSave() {
    if (!saveTimeoutRef.current || !projectId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    const pending = latestContentRef.current;
    if (!pending) return;
    setSaveStatus('saving');
    try {
      await saveDocument(projectId, pending);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  async function handleRenderFullDocument() {
    if (!projectId) return;
    setRendering(true);
    setRenderError(null);
    try {
      await flushPendingSave();
      const result = await formatDocument(projectId);
      setDocContent(result.content);
      setPreviewContent(result.content);
      setDanglingSourceIds(result.dangling_citations.map((d) => d.source_id));
      setRenderVersion((v) => v + 1);
    } catch (err) {
      setRenderError(err instanceof ApiError ? err.message : 'Failed to render the full document.');
    } finally {
      setRendering(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-900">
        <p role="alert" className="text-red-600">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <Link to="/" className="text-xl font-semibold text-brand">
          Alvus AI
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span role="status" data-testid="save-status">
            {SAVE_STATUS_LABEL[saveStatus]}
          </span>
          <button
            type="button"
            onClick={handleRenderFullDocument}
            disabled={rendering}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {rendering ? 'Rendering…' : 'Render full document'}
          </button>
          {projectId && (
            <Link to={`/projects/${projectId}`} className="text-brand underline">
              Sources & bibliography
            </Link>
          )}
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        {project === null || docContent === null ? (
          <p>Loading…</p>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-medium">{project.title}</h1>
              <p className="text-sm text-slate-600">{CITATION_FORMAT_LABELS[project.citation_format]}</p>
            </div>

            {renderError && (
              <p role="alert" className="text-sm text-red-600">
                {renderError}
              </p>
            )}
            {danglingSourceIds.length > 0 && (
              <p role="alert" data-testid="dangling-citations-warning" className="text-sm text-red-600">
                {danglingSourceIds.length} citation{danglingSourceIds.length === 1 ? '' : 's'} reference
                {danglingSourceIds.length === 1 ? 's' : ''} a source no longer in your bibliography. Dangling citations are
                highlighted in the editor below.
              </p>
            )}

            <div className="flex gap-6">
              <div className="flex-1">
                <DocumentEditor
                  key={`${projectId}-${renderVersion}`}
                  initialContent={docContent}
                  onChange={scheduleSave}
                  onEditorReady={(editor) => {
                    editorRef.current = editor;
                  }}
                />
              </div>
              <aside className="w-64 shrink-0">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Bibliography</h2>
                <BibliographySidebar entries={bibliography} onInsert={insertCitation} />
              </aside>
            </div>

            {previewContent && (
              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Full document preview</h2>
                <DocumentPreview
                  key={renderVersion}
                  content={previewContent}
                  citationFormat={project.citation_format}
                  projectTitle={project.title}
                  bibliography={bibliography}
                />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
