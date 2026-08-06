#!/usr/bin/env bash
# Proves the single-Worker AC: `wrangler dev` serves the built apps/web
# placeholder page at "/" and the Hono API at "/api/health", from one process.
set -euo pipefail

LOG=$(mktemp)
npx wrangler dev --port 8787 >"$LOG" 2>&1 &
PID=$!
cleanup() { kill "$PID" >/dev/null 2>&1 || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:8787/api/health; then
    break
  fi
  sleep 1
done

echo "--- GET / ---"
curl -s http://localhost:8787/ | grep -o '<title>[^<]*</title>'

echo "--- GET /api/health ---"
curl -s http://localhost:8787/api/health
echo
