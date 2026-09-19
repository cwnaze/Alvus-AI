#!/usr/bin/env bash
# Proves US-033's ACs: docs/security.md's Authorization section states the real
# enforcement model (service-role DATABASE_URL connection + per-route ownership
# checks, not anon-key RLS), links RLS as a secondary backstop, the secret
# classification table lists SHARE_LINK_ENCRYPTION_KEY, and docs/data-model.md's
# Migration strategy matches. Re-run this to regenerate docs/demos/US-033.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-033 "Security doc's Authorization section matches the app's actual enforcement model" \
  --step "docs/security.md states the real model: postgres role over DATABASE_URL, authorization via loadOwnedProject/requireApproved/authenticate, not anon-key RLS" \
    "grep -n 'postgres.*role\|loadOwnedProject\|requireApproved\|authenticate' docs/security.md" \
  --step "docs/security.md clarifies RLS + grants are a secondary, independently-tested backstop and links US-026's RLS integration suite" \
    "grep -n 'secondary.*backstop\|tests/rls/rls.test.ts' docs/security.md" \
  --step "docs/security.md's secret classification table lists SHARE_LINK_ENCRYPTION_KEY as App runtime, sensitive" \
    "grep -n 'SHARE_LINK_ENCRYPTION_KEY.*App runtime (sensitive)' docs/security.md" \
  --step "docs/data-model.md's Migration strategy section notes RLS is hand-written SQL that is not the live enforcement path" \
    "grep -n 'RLS is a secondary, independently-tested backstop, not the' docs/data-model.md"
