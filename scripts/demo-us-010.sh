#!/usr/bin/env bash
# Proves US-010's ACs: unhandled errors in any Hono route are caught by global
# middleware and returned as the standard { error: { code, message } } envelope
# (never a raw stack trace), every request gets a correlation ID generated-or-
# propagated from an incoming header and included in both the error envelope and
# structured log output, and server-side error logs carry route/correlation
# ID/user ID for debugging without reproducing. Re-run this to regenerate
# docs/demos/US-010.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-010 "Global error handler + structured logging with correlation ID" \
  --step "Correlation ID + global error handler are wired for every request, not one route" \
    "grep -n 'requestId\|onError' apps/worker/src/index.ts" \
  --step "Unhandled errors return the standard envelope with a correlation ID (never a raw stack trace), propagate a caller-supplied ID, and log route/correlation ID/user ID" \
    "npm test --workspace apps/worker -- src/middleware/errors.test.ts --reporter=verbose" \
  --step "A live request against a running Worker: a caller-supplied correlation ID is echoed back on the response" \
    "./scripts/demo-us-010-server.sh"
