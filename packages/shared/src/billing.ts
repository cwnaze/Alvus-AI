import type { Tier } from './auth';

// Mirrors `usage_events.action_type` (docs/data-model.md) -- the two action
// types metered against a tier's monthly limit.
export const METERED_ACTIONS = ['source_analysis', 'feedback_pass'] as const;
export type MeteredAction = (typeof METERED_ACTIONS)[number];

// Paid tiers only -- `free` is never a Checkout target (docs/api.md).
export const PAID_TIERS = ['plus', 'pro'] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export type UsageLimitSummary = {
  used: number;
  limit: number | null;
};

// Wire contract for `GET /billing/status` (docs/api.md). `subscription_status`
// is null until the user has a `subscriptions` row (mirrors Stripe's
// subscription status once US-023/024's Checkout/webhook sync run).
export type BillingStatusResponse = {
  tier: Tier;
  subscription_status: string | null;
  usage: Record<MeteredAction, UsageLimitSummary>;
  renews_at: string;
};

// Wire contract for `POST /billing/checkout-session` (docs/api.md).
export type CheckoutSessionRequest = { tier: PaidTier };
export type CheckoutSessionResponse = { url: string };

// Wire contract for `POST /billing/portal-session` (docs/api.md).
export type PortalSessionResponse = { url: string };
