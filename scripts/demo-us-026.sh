#!/usr/bin/env bash
# Proves US-026's ACs: every public table ships with RLS enabled (with a
# lint/test step that fails the build if a new one doesn't), and a real
# Node/Vitest integration suite against the local Supabase stack proves --
# using actual PostgREST calls with real user JWTs, never the Hono Worker --
# that a non-owner cannot read or write another user's projects/sources/
# documents/feedback passes, that a pending/rejected user's own JWT is denied
# by RLS itself (not just API middleware), and that the share-link read path
# resolves to exactly the linked project and nothing else.
# Re-run this to regenerate docs/demos/US-026.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DATABASE_URL

node e2e/demo-command.mjs US-026 "RLS integration test suite (deny-by-default across roles)" \
  --step "Confirm the local Supabase Postgres service is reachable" \
    "psql $DATABASE_URL -c 'select 1;'" \
  --step "Apply the RLS-enabling migration (supabase/migrations -- idempotent)" \
    "npx supabase db push --db-url \"$DATABASE_URL\" --yes" \
  --step "Confirm every public table has row-level security enabled" \
    "psql $DATABASE_URL -c \"select relname as table, relrowsecurity as rls_enabled from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;\"" \
  --step "The lint/test step: fails the build the moment a table ships without RLS" \
    "npm run test --workspace tests/rls -- rls-lint.test.ts --reporter=verbose" \
  --step "Non-owner denial: an authenticated non-owner cannot read or write another user's projects/sources/documents/feedback passes, and a pending/rejected user's own JWT is denied by RLS itself" \
    "npm run test --workspace tests/rls -- rls.test.ts --reporter=verbose" \
  --step "Share-link read path: resolves to exactly the linked project and nothing else, and still denies a third party via anon-key + RLS" \
    "npm run test --workspace tests/rls -- share-link.test.ts --reporter=verbose"
