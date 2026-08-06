#!/usr/bin/env bash
# Proves US-004's AC: GET /api/health returns 200 including a live DB
# round-trip check. Re-run this to regenerate docs/demos/US-004.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-004 "Health check reports live database connectivity" \
  --step "Boot wrangler dev with DATABASE_URL bound, and hit /api/health" \
    "./scripts/demo-us-004-server.sh"
