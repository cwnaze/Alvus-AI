import type { BibliographyEntry, CitationFormat, OaStatus, Project, ShareLinkResponse, SourceAnalysis, SourceCandidate } from '@alvus-ai/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  analyzeSource,
  ApiError,
  createShareLink,
  deselectSource,
  fetchBibliography,
  fetchProject,
  fetchShareLink,
  rejectSource,
  revokeShareLink,
  searchSources,
  selectSource,
  uploadSource,
} from '../lib/api';

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };

const OA_STATUS_LABELS: Record<OaStatus, string> = {
  gold: 'Open access (gold)',
  green: 'Open access (green)',
  hybrid: 'Open access (hybrid)',
  bronze: 'Open access (bronze)',
  closed: 'Closed access',
};

function analysisErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Failed to analyze this source.';
  if (err.status === 402) {
    const limit = typeof err.meta?.limit === 'number' ? err.meta.limit : null;
    return limit !== null
      ? `You've used all ${limit} source analyses included in your plan this month. Upgrade or wait until it resets.`
      : "You've reached your plan's monthly limit for source analyses.";
  }
  if (err.status === 502) return "We couldn't reach the analysis service right now. Please try again in a bit.";
  return err.message;
}

function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Failed to upload this source.';
  if (err.status === 402) {
    const limit = typeof err.meta?.limit === 'number' ? err.meta.limit : null;
    return limit !== null
      ? `You've used all ${limit} source analyses included in your plan this month. Upgrade or wait until it resets.`
      : "You've reached your plan's monthly limit for source analyses.";
  }
  if (err.status === 413) return 'That file is too large. Files must be 20MB or smaller.';
  if (err.status === 415) return 'Only PDF and TXT files are supported.';
  if (err.status === 502) return "We couldn't reach the analysis service right now. Please try again in a bit.";
  return err.message;
}

function UploadSourceForm({ projectId, onUploaded }: { projectId: string; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadSource(projectId, file, title.trim() || undefined);
      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded();
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Upload your own PDF or TXT</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-700">Source file</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-700">Title (optional)</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Defaults to the file name"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={!file || uploading} className="self-start rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
        {uploading ? 'Uploading…' : 'Upload source'}
      </button>
    </form>
  );
}

function SourceRow({
  projectId,
  candidate,
  onSelected,
  onRejected,
}: {
  projectId: string;
  candidate: SourceCandidate;
  onSelected: () => void;
  onRejected: () => void;
}) {
  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await analyzeSource(projectId, candidate.id));
    } catch (err) {
      setError(analysisErrorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSelect() {
    setActing(true);
    setError(null);
    try {
      await selectSource(projectId, candidate.id);
      onSelected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add this source to the bibliography.');
      setActing(false);
    }
  }

  async function handleReject() {
    setActing(true);
    setError(null);
    try {
      await rejectSource(projectId, candidate.id);
      onRejected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reject this source.');
      setActing(false);
    }
  }

  return (
    <li data-testid={`source-${candidate.id}`} className="flex flex-col gap-2 rounded border border-slate-200 px-4 py-3">
      <span className="font-medium">{candidate.title}</span>
      <span className="text-sm text-slate-600">
        {candidate.authors.length ? candidate.authors.join(', ') : 'Unknown author'}
        {candidate.year ? ` · ${candidate.year}` : ''}
        {candidate.venue ? ` · ${candidate.venue}` : ''}
      </span>
      <span className="text-sm text-slate-500">{candidate.oa_status ? OA_STATUS_LABELS[candidate.oa_status] : 'OA status unknown'}</span>

      {analysis && (
        <div className="flex flex-col gap-2 rounded bg-slate-50 p-3 text-sm">
          {analysis.full_text_status === 'abstract_only' && (
            <span data-testid="abstract-only-badge" className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Abstract-only analysis
            </span>
          )}
          <p>
            <strong>Strengths:</strong> {analysis.summary.strengths}
          </p>
          <p>
            <strong>Weaknesses:</strong> {analysis.summary.weaknesses}
          </p>
          <p>
            <strong>Usefulness:</strong> {analysis.usefulness_score.toFixed(1)}/10
          </p>
          {analysis.key_quotes.length > 0 && (
            <div className="flex flex-col gap-1">
              <strong>Key quotes</strong>
              <ul className="flex flex-col gap-1">
                {analysis.key_quotes.map((quote) => (
                  <li key={quote.quote} className="text-slate-700">
                    “{quote.quote}” — <span className="italic">{quote.usage_suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {!analysis && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || acting}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>
        )}
        <button
          type="button"
          onClick={handleSelect}
          disabled={acting || analyzing}
          className="rounded bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add to bibliography
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={acting || analyzing}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}

function BibliographyEntryRow({
  projectId,
  entry,
  onDeselected,
}: {
  projectId: string;
  entry: BibliographyEntry;
  onDeselected: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeselect() {
    setRemoving(true);
    setError(null);
    try {
      await deselectSource(projectId, entry.source_id);
      onDeselected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove this source.');
      setRemoving(false);
    }
  }

  return (
    <li data-testid={`bibliography-${entry.source_id}`} className="flex flex-col gap-2 rounded border border-slate-200 px-4 py-3">
      <span className="text-sm">{entry.citation_text}</span>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleDeselect}
        disabled={removing}
        className="w-fit rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Remove from bibliography
      </button>
    </li>
  );
}

// A link is loaded lazily and starts `null` (loading); a 404 from the fetch
// means no active link exists yet, represented as `'none'` rather than kept
// as an error -- that's the expected steady state for most projects.
function ShareLinkPanel({ projectId }: { projectId: string }) {
  const [link, setLink] = useState<ShareLinkResponse | 'none' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchShareLink(projectId)
      .then((res) => {
        if (!cancelled) setLink(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setLink('none');
        else setError(err instanceof ApiError ? err.message : 'Failed to load the share link.');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      setLink(await createShareLink(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create a share link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (link === null || link === 'none') return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy the share link.');
    }
  }

  async function handleRevoke() {
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(projectId);
      setLink('none');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke the share link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Share</h2>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {link === null ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : link === 'none' ? (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          data-testid="generate-share-link"
          className="mt-2 rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Get a read-only share link'}
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            readOnly
            value={link.url}
            data-testid="share-link-url"
            onFocus={(e) => e.currentTarget.select()}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              data-testid="copy-share-link"
              className="w-fit rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={busy}
              data-testid="revoke-share-link"
              className="w-fit rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {busy ? 'Revoking…' : 'Revoke link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<SourceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bibliography, setBibliography] = useState<BibliographyEntry[]>([]);

  const refreshBibliography = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetchBibliography(projectId);
      setBibliography(res.entries);
    } catch {
      // Non-critical to the rest of the page -- leave the previous list in place.
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchProject(projectId)
      .then((p) => {
        if (!cancelled) setProject(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load this project.');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchBibliography(projectId)
      .then((res) => {
        if (!cancelled) setBibliography(res.entries);
      })
      .catch(() => {
        // Non-critical to the rest of the page -- leave the previous list in place.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchSources(projectId, { query: query.trim() || undefined });
      setCandidates(res.candidates);
    } catch (err) {
      setCandidates(null);
      setSearchError(
        err instanceof ApiError
          ? err.status === 502
            ? "We couldn't reach the source-search providers right now. Please try again in a bit."
            : err.message
          : 'Failed to search for sources.',
      );
    } finally {
      setSearching(false);
    }
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  function handleSourceSelected(id: string) {
    removeCandidate(id);
    refreshBibliography();
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
        {projectId && (
          <Link to={`/projects/${projectId}/write`} className="rounded bg-brand px-4 py-2 text-sm text-white">
            Start writing
          </Link>
        )}
      </header>

      <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        {project === null ? (
          <p>Loading…</p>
        ) : (
          <div>
            <h1 className="text-lg font-medium">{project.title}</h1>
            <p className="text-sm text-slate-600">{CITATION_FORMAT_LABELS[project.citation_format]}</p>
          </div>
        )}

        <form onSubmit={handleSearch} className="flex flex-col gap-3 rounded border border-slate-200 p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-700">Search query</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={project?.title}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" disabled={searching} className="self-start rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
            {searching ? 'Searching…' : 'Search for sources'}
          </button>
        </form>

        {searchError && (
          <p role="alert" className="text-sm text-red-600">
            {searchError}
          </p>
        )}

        {projectId && <UploadSourceForm projectId={projectId} onUploaded={refreshBibliography} />}

        {projectId && <ShareLinkPanel projectId={projectId} />}

        {candidates !== null && candidates.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <h3 className="text-lg font-medium">No matching sources found</h3>
            <p className="text-slate-600">Try a different search, or add your own source instead.</p>
          </div>
        )}

        {candidates !== null && candidates.length > 0 && projectId && (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <SourceRow
                key={candidate.id}
                projectId={projectId}
                candidate={candidate}
                onSelected={() => handleSourceSelected(candidate.id)}
                onRejected={() => removeCandidate(candidate.id)}
              />
            ))}
          </ul>
        )}

        <div>
          <h2 className="text-lg font-medium">Bibliography</h2>
          {bibliography.length === 0 ? (
            <p className="text-sm text-slate-600">No sources selected yet.</p>
          ) : (
            projectId && (
              <ul className="mt-3 flex flex-col gap-3">
                {bibliography.map((entry) => (
                  <BibliographyEntryRow key={entry.source_id} projectId={projectId} entry={entry} onDeselected={refreshBibliography} />
                ))}
              </ul>
            )
          )}
        </div>
      </section>
    </main>
  );
}
