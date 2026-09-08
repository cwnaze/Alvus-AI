#!/usr/bin/env bash
# Proves US-032's ACs: the shared postgres() client in apps/worker/src/lib/db/client.ts
# has an explicit connect/statement timeout, errors.ts's onError now logs 5xx-class
# AppErrors with a correlationId (previously silent), and -- the actual regression --
# the 5 demo specs that hung indefinitely during production-prep's verification run
# (US-016, US-017, US-018, US-023, US-029) now pass reliably across 3 consecutive runs
# against a production build served by wrangler dev, the same way that pass ran them.
# Re-run this to regenerate docs/demos/US-032.md.
set -euo pipefail
cd "$(dirname "$0")/.."

SPECS="e2e/us-016.spec.ts e2e/us-017.spec.ts e2e/us-018.spec.ts e2e/us-023.spec.ts e2e/us-029.spec.ts"

node e2e/demo-command.mjs US-032 "Add a query/connection timeout to the shared Postgres client" \
  --step "The shared postgres() client is configured with an explicit connect_timeout and statement_timeout, and onError now logs 5xx-class AppErrors (with correlationId) that it previously swallowed" \
    "npm run test --workspace apps/worker -- client.test.ts errors.test.ts --reporter=verbose" \
  --step "Production build -- the same artifact wrangler dev serves in CI" \
    "npm run build" \
  --step "Regression run 1/3 against wrangler dev serving the production build -- these 5 specs hung with zero response during production-prep's own verification run" \
    "CI=true npx playwright test $SPECS" \
  --step "Regression run 2/3" \
    "CI=true npx playwright test $SPECS" \
  --step "Regression run 3/3" \
    "CI=true npx playwright test $SPECS"
