#!/usr/bin/env bash
# Helper for scripts/demo-us-010.sh: boots wrangler dev and confirms the correlation
# ID middleware works against a real running Worker, not just in-process tests —
# a caller-supplied X-Correlation-Id header comes back unchanged on the response.
set -euo pipefail

LOG=$(mktemp)
npx wrangler dev --port 8787 --env-file .env >"$LOG" 2>&1 &
PID=$!
cleanup() { kill "$PID" >/dev/null 2>&1 || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:8787/api/health; then
    break
  fi
  sleep 1
done

echo "--- GET /api/health with a caller-supplied X-Correlation-Id ---"
curl -si -H "X-Correlation-Id: demo-correlation-abc123" http://localhost:8787/api/health | tr -d '\r'
