import type { AdminUser } from '@alvus-ai/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, fetchAdminUsers, revokeUserAccess } from '../lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchAdminUsers({ q: q || undefined, status: status || undefined, tier: tier || undefined });
        if (!cancelled) setUsers(res.users);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load users.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [q, status, tier, reloadToken]);

  async function handleRevoke(userId: string) {
    setError(null);
    setBusyUserId(userId);
    try {
      await revokeUserAccess(userId);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke this user.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-brand">User directory</h1>
          <Link to="/" className="text-sm text-brand underline">
            Back to dashboard
          </Link>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-700">Search by email</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-700">Tier</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">All</option>
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {users === null ? (
          <p>Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-slate-600">No users match these filters.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between rounded border border-slate-200 px-4 py-3">
                <div className="flex flex-col">
                  <span>{user.email}</span>
                  <span className="text-sm text-slate-600">
                    {user.status} · {user.role} · {user.tier} · joined {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  disabled={user.status !== 'approved' || busyUserId === user.id}
                  onClick={() => handleRevoke(user.id)}
                  className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                >
                  Revoke access
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
