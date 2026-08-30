#!/usr/bin/env bash
# Proves US-028's ACs against the real vitest suite: outbound calls to
# Semantic Scholar, CrossRef, Unpaywall, and the LiteLLM proxy all have an
# explicit per-attempt timeout, transient failures (timeout, network error,
# 5xx) are retried with exponential backoff while a 4xx fails fast, and a
# retried call still only records usage/persists its result exactly once --
# after the whole (possibly retried) call resolves.
# Re-run this to regenerate docs/demos/US-028.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-028 "Timeout and retry/backoff policy for outbound calls" \
  --step "The shared retry policy: an explicit per-attempt timeout that aborts a hung request, exponential-backoff retries on timeout/network error/5xx, a 4xx fails fast with no retry, and the retry budget is bounded rather than unbounded" \
    "npm run test --workspace apps/worker -- fetch-with-retry.test.ts --reporter=verbose" \
  --step "Semantic Scholar and CrossRef searches recover from a transient provider failure via the shared retry policy, and surface a provider error -- rather than hanging or retrying forever -- once the retry budget is exhausted" \
    "npm run test --workspace apps/worker -- semantic-scholar.test.ts crossref.test.ts --reporter=verbose" \
  --step "Unpaywall OA resolution is best-effort: it retries a transient failure the same way, but still degrades to null (never throws, never fails the whole source search) once exhausted" \
    "npm run test --workspace apps/worker -- unpaywall.test.ts --reporter=verbose" \
  --step "The LiteLLM proxy client is constructed with an explicit timeout and retry count instead of the SDK's 10-minute default, so a hung or transiently-failing proxy call doesn't hang the request either" \
    "npm run test --workspace apps/worker -- client.test.ts -t 'constructs the LiteLLM client with an explicit timeout' --reporter=verbose" \
  --step "A source analysis or feedback pass records usage / persists its result exactly once, only after the (possibly retried) AI call resolves successfully -- never on a failure, and never twice" \
    "npm run test --workspace apps/worker -- sources.test.ts feedback.test.ts -t '502s when the AI provider is unreachable|meters on success|creates a pass with anchors resolved|does not record usage' --reporter=verbose" \
  --step "Full suite for the record" \
    "npm run test --workspace apps/worker -- fetch-with-retry.test.ts semantic-scholar.test.ts crossref.test.ts unpaywall.test.ts client.test.ts sources.test.ts feedback.test.ts --reporter=verbose"
