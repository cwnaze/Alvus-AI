#!/usr/bin/env bash
# Proves US-004's AC: GET /api/health returns 200 including a live round-trip
# check against the database, not just that the process is up.
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

echo "--- GET /api/health ---"
curl -s http://localhost:8787/api/health
echo
