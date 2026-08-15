#!/usr/bin/env bash
# Proves US-027's ACs against the real vitest suite: the public auth
# endpoints (signup/login/password-reset request) are rate-limited per IP,
# the AI-metered endpoints (analyze, upload+analyze, feedback) are
# rate-limited per user in addition to the existing tier-quota check, and
# every 429 in both classes carries a Retry-After header.
# Re-run this to regenerate docs/demos/US-027.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-027 "Rate limiting on public and metered endpoints" \
  --step "Public auth endpoints (signup, login, password-reset request) are rate-limited per IP, checked before ever calling Supabase, with a 429 + Retry-After once exceeded" \
    "npm run test --workspace apps/worker -- auth.test.ts -t 'per-IP' --reporter=verbose" \
  --step "Metered AI endpoints (analyze existing candidate, upload+analyze, feedback pass) are rate-limited per user in addition to the tier-quota check, with a 429 + Retry-After once exceeded" \
    "npm run test --workspace apps/worker -- sources.test.ts feedback.test.ts -t 'per-user AI rate limit' --reporter=verbose" \
  --step "The underlying rate-limit module: sliding window per IP/endpoint and per user/action type, always resolving silently under the ceiling and always throwing a 429 rate_limited AppError with Retry-After at it" \
    "npm run test --workspace apps/worker -- rate-limit/index.test.ts -t 'AuthRateLimit|AiRateLimit' --reporter=verbose" \
  --step "Full rate-limiting suite, for the record" \
    "npm run test --workspace apps/worker -- rate-limit/index.test.ts auth.test.ts sources.test.ts feedback.test.ts --reporter=verbose"
