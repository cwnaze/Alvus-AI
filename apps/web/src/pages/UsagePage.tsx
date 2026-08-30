import type { BillingStatusResponse, MeteredAction, PaidTier, Tier } from '@alvus-ai/shared';
import { PAID_TIERS } from '@alvus-ai/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, createCheckoutSession, createPortalSession, fetchBillingStatus } from '../lib/api';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PaidTier | 'portal' | null>(null);
  const [justUpgraded, setJustUpgraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sessionId = searchParams.get('session_id');
    async function load() {
      try {
        const res = await fetchBillingStatus(sessionId);
        if (!cancelled) {
          setStatus(res);
          if (sessionId) setJustUpgraded(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load usage.');
      } finally {
        // Strip session_id from the URL either way -- a refresh must not
        // re-confirm (Stripe rejects retrieving an already-consumed intent
        // in some flows) or re-show the success banner.
        if (sessionId && !cancelled) setSearchParams({}, { replace: true });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; session_id is read from the URL at that moment only
  }, []);

  async function handleUpgrade(tier: PaidTier) {
    setBillingError(null);
    setPendingAction(tier);
    try {
      const { url } = await createCheckoutSession(tier);
      window.location.assign(url);
    } catch (err) {
      setBillingError(err instanceof ApiError ? err.message : 'Failed to start checkout.');
      setPendingAction(null);
    }
  }

  async function handleManageBilling() {
    setBillingError(null);
    setPendingAction('portal');
    try {
      const { url } = await createPortalSession();
      window.location.assign(url);
    } catch (err) {
      setBillingError(err instanceof ApiError ? err.message : 'Failed to open the billing portal.');
      setPendingAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-brand">Alvus AI</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
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

        {billingError && (
          <p role="alert" data-testid="billing-error" className="text-sm text-red-600">
            {billingError}
          </p>
        )}

        {justUpgraded && (
          <p role="status" data-testid="checkout-success" className="text-sm text-green-700">
            Your subscription is active.
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

            <div className="flex flex-col gap-3 rounded border border-slate-200 px-4 py-3">
              <span className="text-sm text-slate-600">Billing</span>
              <div className="flex flex-wrap gap-2">
                {PAID_TIERS.filter((tier) => tier !== status.tier).map((tier) => (
                  <button
                    key={tier}
                    data-testid={`upgrade-${tier}`}
                    onClick={() => handleUpgrade(tier)}
                    disabled={pendingAction !== null}
                    className="rounded bg-brand px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {pendingAction === tier ? 'Redirecting…' : `Upgrade to ${TIER_LABELS[tier]}`}
                  </button>
                ))}
                {status.subscription_status !== null && (
                  <button
                    data-testid="manage-billing"
                    onClick={() => handleManageBilling()}
                    disabled={pendingAction !== null}
                    className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                  >
                    {pendingAction === 'portal' ? 'Redirecting…' : 'Manage billing'}
                  </button>
                )}
              </div>
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
