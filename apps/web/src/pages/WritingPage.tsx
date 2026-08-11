import type { CitationFormat, DocumentContent, Project } from '@alvus-ai/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DocumentEditor from '../editor/DocumentEditor';
import { ApiError, fetchDocument, fetchProject, saveDocument } from '../lib/api';

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

export default function WritingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [docContent, setDocContent] = useState<DocumentContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef<DocumentContent | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all([fetchProject(projectId), fetchDocument(projectId)])
      .then(([proj, doc]) => {
        if (cancelled) return;
        setProject(proj);
        setDocContent(doc.content);
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
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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
          {projectId && (
            <Link to={`/projects/${projectId}`} className="text-brand underline">
              Sources & bibliography
            </Link>
          )}
        </div>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {project === null || docContent === null ? (
          <p>Loading…</p>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-medium">{project.title}</h1>
              <p className="text-sm text-slate-600">{CITATION_FORMAT_LABELS[project.citation_format]}</p>
            </div>
            <DocumentEditor initialContent={docContent} onChange={scheduleSave} />
          </>
        )}
      </section>
    </main>
  );
}
