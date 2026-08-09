import type { CitationFormat, Project } from '@alvus-ai/shared';
import { CITATION_FORMATS } from '@alvus-ai/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, createProject, deleteProject, fetchProjects, renameProject } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = { mla: 'MLA', apa: 'APA', chicago: 'Chicago' };

function ProjectRow({ project, onChanged }: { project: Project; onChanged: (updated?: Project) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated = await renameProject(project.id, title);
      setRenaming(false);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename this project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteProject(project.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete this project.');
      setBusy(false);
    }
  }

  return (
    <li data-testid={`project-${project.id}`} className="flex flex-col gap-2 rounded border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {renaming ? (
          <form onSubmit={handleRename} className="flex flex-1 items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">Title</span>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <button type="submit" disabled={busy} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setTitle(project.title);
                setRenaming(false);
              }}
              className="rounded border border-slate-300 px-3 py-1"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex flex-col">
            <Link to={`/projects/${project.id}`} className="font-medium text-brand underline">
              {project.title}
            </Link>
            <span className="text-sm text-slate-600">
              {CITATION_FORMAT_LABELS[project.citation_format]} · {project.status}
            </span>
          </div>
        )}

        {!renaming && !confirmingDelete && (
          <div className="flex gap-2">
            <button onClick={() => setRenaming(true)} className="rounded border border-slate-300 px-3 py-1">
              Rename
            </button>
            <button onClick={() => setConfirmingDelete(true)} className="rounded border border-slate-300 px-3 py-1">
              Delete
            </button>
          </div>
        )}

        {confirmingDelete && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">Delete this project?</span>
            <button
              disabled={busy}
              onClick={handleDelete}
              className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
            >
              Confirm delete
            </button>
            <button disabled={busy} onClick={() => setConfirmingDelete(false)} className="rounded border border-slate-300 px-3 py-1">
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

function NewProjectForm({ onCreated, onCancel }: { onCreated: (project: Project) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [citationFormat, setCitationFormat] = useState<CitationFormat>('mla');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const project = await createProject(title, citationFormat);
      onCreated(project);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create this project.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border border-slate-200 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-700">Title</span>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-700">Citation format</span>
        <select
          value={citationFormat}
          onChange={(e) => setCitationFormat(e.target.value as CitationFormat)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          {CITATION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {CITATION_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
          {pending ? 'Creating…' : 'Create project'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DashboardPage() {
  const auth = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchProjects();
        if (!cancelled) {
          setProjects(res.projects);
          setNextCursor(res.next_cursor);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetchProjects(nextCursor);
      setProjects((prev) => [...(prev ?? []), ...res.projects]);
      setNextCursor(res.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more projects.');
    } finally {
      setLoadingMore(false);
    }
  }

  function handleCreated(project: Project) {
    setProjects((prev) => [...(prev ?? []), project]);
    setShowCreateForm(false);
  }

  function handleChanged(projectId: string, updated?: Project) {
    setProjects((prev) => {
      if (!prev) return prev;
      if (!updated) return prev.filter((p) => p.id !== projectId);
      return prev.map((p) => (p.id === projectId ? updated : p));
    });
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-brand">Alvus AI</h1>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>{auth.user?.email}</span>
          {auth.user?.role === 'admin' && (
            <>
              <Link to="/admin/waitlist" className="text-brand underline">
                Waitlist admin
              </Link>
              <Link to="/admin/users" className="text-brand underline">
                User directory
              </Link>
            </>
          )}
          <button onClick={() => auth.signOut()} className="rounded border border-slate-300 px-3 py-1">
            Log out
          </button>
        </div>
      </header>

      <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Your projects</h2>
          {!showCreateForm && (
            <button onClick={() => setShowCreateForm(true)} className="rounded bg-brand px-4 py-2 text-white">
              New project
            </button>
          )}
        </div>

        {showCreateForm && <NewProjectForm onCreated={handleCreated} onCancel={() => setShowCreateForm(false)} />}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {projects === null ? (
          <p>Loading…</p>
        ) : projects.length === 0 ? (
          !showCreateForm && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <h3 className="text-lg font-medium">You don't have any projects yet</h3>
              <p className="text-slate-600">Start a new project to begin researching and writing.</p>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} onChanged={(updated) => handleChanged(project.id, updated)} />
            ))}
          </ul>
        )}

        {nextCursor && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center rounded border border-slate-300 px-4 py-2 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </main>
  );
}
