import type { WaitlistEntry } from '@alvus-ai/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, approveWaitlistEntry, fetchWaitlist, rejectWaitlistEntry } from '../lib/api';

export default function AdminWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWaitlist('pending');
        if (!cancelled) setEntries(res.entries);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load the waitlist.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function handleReview(userId: string, action: 'approve' | 'reject') {
    setError(null);
    setBusyUserId(userId);
    try {
      if (action === 'approve') await approveWaitlistEntry(userId);
      else await rejectWaitlistEntry(userId);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update this entry.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-brand">Waitlist approvals</h1>
          <Link to="/" className="text-sm text-brand underline">
            Back to dashboard
          </Link>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {entries === null ? (
          <p>Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-slate-600">No pending signups.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded border border-slate-200 px-4 py-3"
              >
                <span>{entry.email}</span>
                <div className="flex gap-2">
                  <button
                    disabled={busyUserId === entry.user_id}
                    onClick={() => handleReview(entry.user_id, 'approve')}
                    className="rounded bg-brand px-3 py-1 text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busyUserId === entry.user_id}
                    onClick={() => handleReview(entry.user_id, 'reject')}
                    className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
