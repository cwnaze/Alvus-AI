#!/usr/bin/env bash
# Proves US-005's AC: the CI required check (.github/workflows/ci.yml) runs
# typecheck/lint/build/test on every PR against a local Supabase Postgres service.
# Runs the exact same steps that workflow's "Typecheck, lint, build, test" step
# runs, against the same local Postgres its setup-project step starts via
# `npx supabase start`. Re-run this to regenerate docs/demos/US-005.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DATABASE_URL

node e2e/demo-command.mjs US-005 "CI test gate: typecheck/lint/build/test against a local Supabase Postgres service" \
  --step "Confirm the local Supabase Postgres service (started in CI by setup-project's services step) is reachable" \
    "psql $DATABASE_URL -c 'select 1;'" \
  --step "ci.yml wires typecheck/lint/build/test into the required PR status check, with DATABASE_URL bound to that service" \
    "grep -A12 'Typecheck, lint, build, test' .github/workflows/ci.yml" \
  --step "Typecheck" \
    "npm run typecheck" \
  --step "Lint" \
    "npm run lint" \
  --step "Build" \
    "npm run build" \
  --step "Test" \
    "npm test"
