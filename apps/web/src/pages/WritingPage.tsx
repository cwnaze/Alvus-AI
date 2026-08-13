import type { BibliographyEntry, CitationFormat, DocumentContent, FeedbackComment, FeedbackPassSummary, Project } from '@alvus-ai/shared';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DocumentEditor from '../editor/DocumentEditor';
import DocumentPreview from '../editor/DocumentPreview';
import {
  ApiError,
  fetchBibliography,
  fetchDocument,
  fetchFeedbackPass,
  fetchFeedbackPasses,
  fetchProject,
  fetchSuggestions,
  formatDocument,
  requestFeedbackPass,
  saveDocument,
} from '../lib/api';

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };

const FEEDBACK_CATEGORY_LABELS: Record<FeedbackComment['category'], string> = {
  wording: 'Wording',
  phrasing: 'Phrasing',
  grammar: 'Grammar',
  content: 'Content',
};

function FeedbackPanel({
  comments,
  onSelect,
}: {
  comments: FeedbackComment[];
  onSelect: (comment: FeedbackComment) => void;
}) {
  if (comments.length === 0) {
    return <p className="text-sm text-slate-500">This pass found nothing to flag.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => (
        <li key={comment.id} data-testid={`feedback-comment-${comment.id}`}>
          <button
            type="button"
            onClick={() => onSelect(comment)}
            className="flex w-full flex-col gap-1 rounded border border-slate-200 px-3 py-2 text-left hover:border-brand"
          >
            <span className="w-fit rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {FEEDBACK_CATEGORY_LABELS[comment.category]}
            </span>
            <span className="text-sm text-slate-700">{comment.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FeedbackHistory({
  passes,
  onReopen,
}: {
  passes: FeedbackPassSummary[];
  onReopen: (passId: string) => void;
}) {
  if (passes.length === 0) {
    return <p className="text-sm text-slate-500">No past feedback passes yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {passes.map((pass) => (
        <li
          key={pass.pass_id}
          data-testid={`feedback-history-item-${pass.pass_id}`}
          className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
        >
          <span className="text-slate-600">
            {new Date(pass.created_at).toLocaleString()} · {pass.comment_count} comment{pass.comment_count === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => onReopen(pass.pass_id)}
            data-testid={`reopen-feedback-${pass.pass_id}`}
            className="shrink-0 rounded border border-brand px-2 py-1 text-xs text-brand"
          >
            Reopen
          </button>
        </li>
      ))}
    </ul>
  );
}

// How much text immediately before the cursor to send as context -- enough for a
// useful suggestion without shipping the whole document on every request.
const CURSOR_CONTEXT_CHARS = 1000;

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

  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [feedbackComments, setFeedbackComments] = useState<FeedbackComment[] | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackPassSummary[] | null>(null);
  const [feedbackHistoryLoading, setFeedbackHistoryLoading] = useState(false);

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

  // A hint, never inserted text -- CLAUDE.md: "never generating prose itself". This
  // reads the current cursor position directly off the live editor instance rather
  // than the (possibly stale, debounce-delayed) `docContent` state.
  async function handleRequestSuggestions() {
    if (!projectId || !editorRef.current) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const { from } = editorRef.current.state.selection;
      const cursorContext = editorRef.current.state.doc.textBetween(Math.max(0, from - CURSOR_CONTEXT_CHARS), from, '\n', '\n');
      const result = await fetchSuggestions(projectId, cursorContext);
      setSuggestions(result.suggestions);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setSuggestionsError("You're requesting suggestions too quickly. Please wait a moment and try again.");
      } else {
        setSuggestionsError(err instanceof ApiError ? err.message : 'Failed to get suggestions.');
      }
      setSuggestions(null);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // A feedback pass is metered (unlike suggestions), so this always flushes
  // the pending autosave first -- the AI should comment on exactly what's
  // persisted, not a stale version, and the request shouldn't burn quota
  // against content that's about to be overwritten by a delayed autosave.
  async function handleRequestFeedback() {
    if (!projectId || !editorRef.current) return;
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      await flushPendingSave();
      const result = await requestFeedbackPass(projectId);
      setFeedbackComments(result.comments);
      editorRef.current.commands.setFeedbackComments(result.comments);
      setFeedbackHistory((prev) =>
        prev ? [{ pass_id: result.pass_id, created_at: result.created_at, comment_count: result.comments.length }, ...prev] : prev,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setFeedbackError("You've reached your monthly feedback pass limit on your current plan.");
      } else if (err instanceof ApiError && err.status === 422) {
        setFeedbackError('Write something before requesting feedback.');
      } else {
        setFeedbackError(err instanceof ApiError ? err.message : 'Failed to get feedback.');
      }
      setFeedbackComments(null);
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function handleToggleFeedbackHistory() {
    if (!projectId) return;
    if (feedbackHistory !== null) {
      setFeedbackHistory(null);
      return;
    }
    setFeedbackHistoryLoading(true);
    setFeedbackError(null);
    try {
      const result = await fetchFeedbackPasses(projectId);
      setFeedbackHistory(result.passes);
    } catch (err) {
      setFeedbackError(err instanceof ApiError ? err.message : 'Failed to load feedback history.');
    } finally {
      setFeedbackHistoryLoading(false);
    }
  }

  // Reopening a past pass just re-fetches its comments and re-applies them to
  // the live editor -- no separate viewer, same rendering path as a freshly
  // requested pass.
  async function handleReopenFeedbackPass(passId: string) {
    if (!projectId || !editorRef.current) return;
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const result = await fetchFeedbackPass(projectId, passId);
      setFeedbackComments(result.comments);
      editorRef.current.commands.setFeedbackComments(result.comments);
    } catch (err) {
      setFeedbackError(err instanceof ApiError ? err.message : 'Failed to reopen this feedback pass.');
    } finally {
      setFeedbackLoading(false);
    }
  }

  function handleSelectFeedbackComment(comment: FeedbackComment) {
    editorRef.current
      ?.chain()
      .focus()
      .setTextSelection({ from: comment.anchor.from, to: comment.anchor.to })
      .scrollIntoView()
      .run();
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
            onClick={handleRequestSuggestions}
            disabled={suggestionsLoading || docContent === null}
            data-testid="request-suggestions"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {suggestionsLoading ? 'Getting suggestions…' : 'Suggest a starting point'}
          </button>
          <button
            type="button"
            onClick={handleRenderFullDocument}
            disabled={rendering || docContent === null}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {rendering ? 'Rendering…' : 'Render full document'}
          </button>
          <button
            type="button"
            onClick={handleRequestFeedback}
            disabled={feedbackLoading || docContent === null}
            data-testid="request-feedback"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {feedbackLoading ? 'Getting feedback…' : 'Get feedback'}
          </button>
          <button
            type="button"
            onClick={handleToggleFeedbackHistory}
            disabled={feedbackHistoryLoading}
            data-testid="toggle-feedback-history"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {feedbackHistoryLoading ? 'Loading…' : feedbackHistory !== null ? 'Hide feedback history' : 'Feedback history'}
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
            {feedbackError && (
              <p role="alert" data-testid="feedback-error" className="text-sm text-red-600">
                {feedbackError}
              </p>
            )}
            {feedbackHistory !== null && (
              <div data-testid="feedback-history">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Past feedback passes</h2>
                <FeedbackHistory passes={feedbackHistory} onReopen={handleReopenFeedbackPass} />
              </div>
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

                {suggestionsError && (
                  <p role="alert" data-testid="suggestions-error" className="mt-3 text-sm text-red-600">
                    {suggestionsError}
                  </p>
                )}
                {suggestions && suggestions.length > 0 && (
                  <div data-testid="suggestion-hints" className="mt-3 flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-700">Suggestions -- starting points, not text to insert</h2>
                    <ul className="flex flex-col gap-2">
                      {suggestions.map((suggestion, i) => (
                        <li key={i} data-testid={`suggestion-hint-${i}`} className="text-sm text-slate-700">
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <aside className="w-64 shrink-0">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Bibliography</h2>
                <BibliographySidebar entries={bibliography} onInsert={insertCitation} />

                {feedbackComments && (
                  <div data-testid="feedback-panel" className="mt-6">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">
                      Feedback -- advisory only, nothing is changed in your document
                    </h2>
                    <FeedbackPanel comments={feedbackComments} onSelect={handleSelectFeedbackComment} />
                  </div>
                )}
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
