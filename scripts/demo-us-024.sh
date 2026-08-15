#!/usr/bin/env bash
# Proves US-024's ACs: a real Stripe SDK-signed fixture event is POSTed
# directly to the Worker's /api/billing/webhook route (per docs/testing.md --
# real webhook delivery is never relied on in the automated suite), asserting
# signature verification, the checkout.session.completed -> user linking
# path, the customer.subscription.* -> subscriptions row sync, and the
# invoice.payment_failed grace period that defers any downgrade until Stripe
# itself reports the subscription canceled/unpaid.
# Re-run this to regenerate docs/demos/US-024.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-024 "Stripe webhook sync (subscription status, grace period, signature verification)" \
  --step "An invalid/missing Stripe-Signature is rejected and never reaches subscription-sync logic" \
    "npm run test --workspace apps/worker -- billing-webhook.test.ts -t 'missing|does not match the payload' --reporter=verbose" \
  --step "checkout.session.completed links the session's subscription/customer to the initiating user via client_reference_id, falling back to metadata.user_id" \
    "npm run test --workspace apps/worker -- billing-webhook.test.ts -t 'checkout.session.completed|metadata.user_id' --reporter=verbose" \
  --step "customer.subscription.created/updated/deleted keep status, current_period_start/end, and cancel_at_period_end in sync, mapping the Stripe price id back to plus/pro" \
    "npm run test --workspace apps/worker -- billing-webhook.test.ts src/lib/stripe/subscription-sync.test.ts -t 'syncs subscription state|maps the|keeps a known status' --reporter=verbose" \
  --step "invoice.payment_failed does not downgrade the user; the tier only drops to free once Stripe reports the subscription canceled or unpaid" \
    "npm run test --workspace apps/worker -- billing-webhook.test.ts src/lib/stripe/subscription-sync.test.ts -t 'grace period|downgrades to free' --reporter=verbose" \
  --step "Full webhook + subscription-sync suite, for the record" \
    "npm run test --workspace apps/worker -- billing-webhook.test.ts src/lib/stripe/subscription-sync.test.ts --reporter=verbose"
