#!/usr/bin/env bash
# Proves US-002's two ACs: the local Supabase stack + source-uploads bucket come up
# usable for dev/CI, and Drizzle migrates the baseline schema (users, waitlist_signups,
# tier_limits) against DATABASE_URL. Re-run this to regenerate docs/demos/US-002.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DATABASE_URL

node e2e/demo-command.mjs US-002 "Provision Supabase (Postgres + Storage) and connect Drizzle to a migrated baseline schema" \
  --step "Boot the local Supabase stack (dev/CI parity)" \
    "npx supabase start 2>&1 | grep -oE '\"(API|DB|STUDIO)_URL\":\"[^\"]*\"'" \
  --step "Confirm the source-uploads Storage bucket is private (RLS-ready, no public read until owner-scoped policies land in US-014/US-017)" \
    "psql $DATABASE_URL -c \"select id, name, public from storage.buckets where id = 'source-uploads';\"" \
  --step "Apply the baseline schema via drizzle-kit" \
    "npx drizzle-kit migrate" \
  --step "Confirm users, waitlist_signups, and tier_limits exist, including the users -> auth.users FK" \
    "psql $DATABASE_URL -c '\d public.users' -c '\d public.waitlist_signups' -c '\d public.tier_limits'"
