import type { Tier } from './auth';

// Mirrors `usage_events.action_type` (docs/data-model.md) -- the two action
// types metered against a tier's monthly limit.
export const METERED_ACTIONS = ['source_analysis', 'feedback_pass'] as const;
export type MeteredAction = (typeof METERED_ACTIONS)[number];

export type UsageLimitSummary = {
  used: number;
  limit: number | null;
};

// Wire contract for `GET /billing/status` (docs/api.md). `subscription_status`
// is null until Stripe billing (US-023/024) creates a `subscriptions` row --
// every account is on `free` with nothing to report a status from until then.
export type BillingStatusResponse = {
  tier: Tier;
  subscription_status: string | null;
  usage: Record<MeteredAction, UsageLimitSummary>;
  renews_at: string;
};
