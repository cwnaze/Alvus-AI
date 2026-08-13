import type { BillingStatusResponse, MeteredAction, Tier } from '@alvus-ai/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, fetchBillingStatus } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const TIER_LABELS: Record<Tier, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

const ACTION_LABELS: Record<MeteredAction, string> = {
  source_analysis: 'Source analyses',
  feedback_pass: 'Feedback passes',
};

function UsageRow({ action, used, limit }: { action: MeteredAction; used: number; limit: number | null }) {
  const atLimit = limit !== null && used >= limit;
  const pct = limit !== null ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <li data-testid={`usage-${action}`} className="flex flex-col gap-2 rounded border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{ACTION_LABELS[action]}</span>
        <span className="text-sm text-slate-600">{limit === null ? `${used} used · unlimited` : `${used} / ${limit} used`}</span>
      </div>
      {limit !== null && (
        <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
          <div className={`h-full ${atLimit ? 'bg-red-600' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {atLimit && (
        <p role="alert" className="text-sm text-red-600">
          You've used all {limit} {ACTION_LABELS[action].toLowerCase()} included in your plan this month. Upgrade or wait until it
          resets.
        </p>
      )}
    </li>
  );
}

export default function UsagePage() {
  const auth = useAuth();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchBillingStatus();
        if (!cancelled) setStatus(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load usage.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-brand">Alvus AI</h1>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>{auth.user?.email}</span>
          <Link to="/" className="text-brand underline">
            Dashboard
          </Link>
          <button onClick={() => auth.signOut()} className="rounded border border-slate-300 px-3 py-1">
            Log out
          </button>
        </div>
      </header>

      <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <h2 className="text-lg font-medium">Usage</h2>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {status === null ? (
          !error && <p>Loading…</p>
        ) : (
          <>
            <div data-testid="usage-tier" className="rounded border border-slate-200 px-4 py-3">
              <span className="text-sm text-slate-600">Current plan</span>
              <p className="text-lg font-medium">{TIER_LABELS[status.tier]}</p>
            </div>

            <ul className="flex flex-col gap-3">
              <UsageRow action="source_analysis" used={status.usage.source_analysis.used} limit={status.usage.source_analysis.limit} />
              <UsageRow action="feedback_pass" used={status.usage.feedback_pass.used} limit={status.usage.feedback_pass.limit} />
            </ul>

            <p data-testid="usage-resets-at" className="text-sm text-slate-600">
              Usage resets on{' '}
              {new Date(status.renews_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
