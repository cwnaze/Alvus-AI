import type { SharedPaperResponse } from '@alvus-ai/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DocumentPreview from '../editor/DocumentPreview';
import { ApiError, fetchSharedPaper } from '../lib/api';

// Unknown and revoked/expired tokens render the same "no longer works"
// state (AC3) -- distinguishing them to the visitor would only leak whether
// a token ever existed, which isn't useful to a reader and is exactly the
// kind of detail docs/security.md's share-link rule says not to expose.
export default function SharedPaperPage() {
  const { token } = useParams<{ token: string }>();
  const [paper, setPaper] = useState<SharedPaperResponse | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchSharedPaper(token)
      .then((res) => {
        if (!cancelled) setPaper(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) setInvalid(true);
        else setError(err instanceof ApiError ? err.message : 'Failed to load this paper.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (invalid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-900">
        <p data-testid="share-link-invalid" className="text-slate-600">
          This link no longer works.
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-900">
        <p role="alert" data-testid="share-link-error" className="text-red-600">
          {error}
        </p>
      </main>
    );
  }

  if (!paper) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-500">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 px-6 py-4">
        <span className="text-xl font-semibold text-brand">Alvus AI</span>
        <p className="text-sm text-slate-500">Read-only shared view</p>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-8">
        <DocumentPreview
          content={paper.document.content}
          citationFormat={paper.project.citation_format}
          projectTitle={paper.project.title}
          bibliography={paper.bibliography}
        />
      </section>
    </main>
  );
}
