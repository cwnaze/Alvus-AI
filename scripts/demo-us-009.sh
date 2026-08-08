#!/usr/bin/env bash
# Proves US-009's ACs: a deliberately-broken deploy is rolled back via
# `wrangler rollback [deployment-id]` with command output showing the
# previous version serving again, a hand-written down-migration exists for
# an applied migration and runs cleanly against the real DATABASE_URL, and
# the rollback procedure is documented in the README.
#
# AC1 is exercised against a disposable scratch Worker
# (scripts/demo-us-009-rollback-worker.sh), never the real `alvus-ai`
# production Worker, so this demo can't cause a real outage. AC2 runs the
# down-migration wrapped in BEGIN/ROLLBACK against the real DATABASE_URL, so
# it proves the SQL is valid against the live schema without actually
# dropping the tables.
# Re-run this to regenerate docs/demos/US-009.md.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

node e2e/demo-command.mjs US-009 "Verify rollback path (Worker + migration)" \
  --step "A deliberately-broken deploy is rolled back via wrangler rollback [deployment-id], and the command output demonstrates the previous version serving again (exercised against a disposable scratch Worker, never the real alvus-ai production Worker, so this proof can't cause a real outage)" \
    "./scripts/demo-us-009-rollback-worker.sh" \
  --step "A hand-written down-migration exists for the one applied migration (drizzle/migrations/0000_simple_blockbuster.sql)" \
    "cat drizzle/rollback/0000_simple_blockbuster_down.sql" \
  --step "The down-migration runs cleanly against the real DATABASE_URL (wrapped in BEGIN/ROLLBACK so this proof does not actually drop the tables)" \
    'psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -c "BEGIN" -f drizzle/rollback/0000_simple_blockbuster_down.sql -c "ROLLBACK"' \
  --step "Rollback procedure is documented in the README" \
    "grep -n -A22 '^### Rollback' README.md"
