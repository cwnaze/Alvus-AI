#!/usr/bin/env bash
# Proves US-008's ACs: db/bootstrap-admin.ts promotes an existing Supabase Auth account
# to role=admin, status=approved directly against DATABASE_URL -- creating the users/
# waitlist_signups rows if they don't yet exist -- with no HTTP endpoint involved.
# Re-run this to regenerate docs/demos/US-008.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DATABASE_URL

npx supabase start > /dev/null 2>&1
npx drizzle-kit migrate > /dev/null

STATUS_JSON="$(npx supabase status -o json)"
SUPABASE_URL="$(node -e "console.log(JSON.parse(process.argv[1]).API_URL)" "$STATUS_JSON")"
SUPABASE_PUBLISHABLE_KEY="$(node -e "console.log(JSON.parse(process.argv[1]).PUBLISHABLE_KEY)" "$STATUS_JSON")"
SUPABASE_SECRET_KEY="$(node -e "console.log(JSON.parse(process.argv[1]).SECRET_KEY)" "$STATUS_JSON")"
export SUPABASE_URL SUPABASE_SECRET_KEY

EMAIL="bootstrap-demo@example.test"
psql "$DATABASE_URL" -c "delete from public.waitlist_signups where email = '$EMAIL';" > /dev/null
psql "$DATABASE_URL" -c "delete from public.users where email = '$EMAIL';" > /dev/null
psql "$DATABASE_URL" -c "delete from auth.users where email = '$EMAIL';" > /dev/null

node e2e/demo-command.mjs US-008 "Bootstrap first admin account" \
  --step "Create a normal Supabase Auth account for the operator -- signing up never requires an admin to exist" \
    "curl -s -o /dev/null -w '%{http_code}' -X POST \"$SUPABASE_URL/auth/v1/signup\" -H \"apikey: $SUPABASE_PUBLISHABLE_KEY\" -H 'Content-Type: application/json' -d \"{\\\"email\\\":\\\"$EMAIL\\\",\\\"password\\\":\\\"Demo-Passw0rd!\\\"}\"" \
  --step "Confirm no users/waitlist_signups row exists yet for that account (this script creates them if missing)" \
    "psql \"\$DATABASE_URL\" -c \"select email, role, status from public.users where email = '$EMAIL';\"" \
  --step "Promote it to admin -- a CLI script run directly against DATABASE_URL, never an HTTP endpoint" \
    "npm run db:bootstrap-admin -- $EMAIL" \
  --step "Confirm users.role=admin, users.status=approved, and waitlist_signups is now approved too" \
    "psql \"\$DATABASE_URL\" -c \"select email, role, status from public.users where email = '$EMAIL';\" -c \"select email, status from public.waitlist_signups where email = '$EMAIL';\"" \
  --step "Confirm re-running is idempotent (no duplicate-key errors, same result)" \
    "npm run db:bootstrap-admin -- $EMAIL"
