import type { CitationFormat, OaStatus, Project, SourceCandidate } from '@alvus-ai/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, fetchProject, searchSources } from '../lib/api';

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };

const OA_STATUS_LABELS: Record<OaStatus, string> = {
  gold: 'Open access (gold)',
  green: 'Open access (green)',
  hybrid: 'Open access (hybrid)',
  bronze: 'Open access (bronze)',
  closed: 'Closed access',
};

function SourceRow({ candidate }: { candidate: SourceCandidate }) {
  return (
    <li data-testid={`source-${candidate.id}`} className="flex flex-col gap-1 rounded border border-slate-200 px-4 py-3">
      <span className="font-medium">{candidate.title}</span>
      <span className="text-sm text-slate-600">
        {candidate.authors.length ? candidate.authors.join(', ') : 'Unknown author'}
        {candidate.year ? ` · ${candidate.year}` : ''}
        {candidate.venue ? ` · ${candidate.venue}` : ''}
      </span>
      <span className="text-sm text-slate-500">{candidate.oa_status ? OA_STATUS_LABELS[candidate.oa_status] : 'OA status unknown'}</span>
    </li>
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

        {candidates !== null && candidates.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <h3 className="text-lg font-medium">No matching sources found</h3>
            <p className="text-slate-600">Try a different search, or add your own source instead.</p>
            <button type="button" disabled title="Coming soon" className="rounded border border-slate-300 px-4 py-2 opacity-50">
              Upload your own PDF or TXT
            </button>
          </div>
        )}

        {candidates !== null && candidates.length > 0 && (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <SourceRow key={candidate.id} candidate={candidate} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
