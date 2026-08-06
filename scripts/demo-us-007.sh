#!/usr/bin/env bash
# Proves US-007's ACs: merge-to-main migrates (halting on failure) before
# `wrangler deploy`, every PR gets a Cloudflare preview with a posted-back URL
# using only the Cloudflare deploy-time credential, CI secrets are configured
# in the GitHub Actions secrets store, and app-runtime secrets are bound to
# the Worker via `wrangler secret put` rather than plaintext `vars`.
#
# This demo deliberately never performs the real mutating actions
# (`wrangler deploy`, a non-dry-run `supabase db push`, `wrangler secret put`)
# against the live Cloudflare/Supabase projects `.env` points at — those are
# reserved for the actual `deploy.yml` run that follows a real merge to main.
# It runs the real, idempotent, read-only, or --dry-run form of each command
# instead, against the same real deploy-time credentials CI uses.
# Re-run this to regenerate docs/demos/US-007.md.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

node e2e/demo-command.mjs US-007 "Deploy pipeline: migrate + wrangler deploy on merge, PR previews, secrets configured" \
  --step "Every PR gets a Cloudflare Workers preview: deploy-preview.yml uploads a per-PR Worker Version (never production traffic, never the Worker's bound secrets) using only the Cloudflare deploy-time credential, then posts the alias URL back to the PR" \
    "grep -B2 -A12 'Upload preview version' .github/workflows/deploy-preview.yml" \
  --step "Packaging a preview version succeeds end-to-end (dry run — this demo does not push a live Cloudflare deploy)" \
    "npx wrangler versions upload --dry-run --preview-alias pr-demo --env-file .env" \
  --step "On merge to main, deploy.yml halts before wrangler deploy if migrations fail: migrate-then-deploy ordering, with no continue-on-error" \
    "grep -A20 'name: Run migrations' .github/workflows/deploy.yml" \
  --step "drizzle-kit migrate applies cleanly against the real deploy-time database (idempotent — a no-op once already applied)" \
    "npx drizzle-kit migrate" \
  --step "supabase db push would apply cleanly against the same database (dry run — this demo does not mutate the live project)" \
    "npx supabase db push --db-url \"\$DATABASE_URL\" --dry-run --yes" \
  --step "CI secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, DATABASE_URL) are configured in the GitHub Actions secrets store" \
    "gh secret list | grep -E '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|SUPABASE_ACCESS_TOKEN|DATABASE_URL)\b'" \
  --step "wrangler.jsonc declares no plaintext vars block — app-runtime values only ever reach the Worker as secrets" \
    "cat wrangler.jsonc" \
  --step "Every app-runtime variable (.env.example's 'App runtime' section) is bound to the Worker via wrangler secret put, sourced from the same repo secrets" \
    "cat .github/scripts/put-worker-secrets.mjs"
