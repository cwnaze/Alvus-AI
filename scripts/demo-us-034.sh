#!/usr/bin/env bash
# Proves US-034's ACs: docs/data-model.md's ER diagram and per-table sections
# document share_link_lookups, auth_rate_limit_attempts, and ai_rate_limit_attempts
# (all added by US-027) with field lists mirroring apps/worker/src/lib/db/schema/,
# and the Sensitivity summary table classifies their IP address columns as
# sensitive. Re-run this to regenerate docs/demos/US-034.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-034 "docs/data-model.md documents the three rate-limit tables" \
  --step "ER diagram references all three tables added by US-027" \
    "grep -n 'share_link_lookups\|auth_rate_limit_attempts\|ai_rate_limit_attempts' docs/data-model.md | head -6" \
  --step "share_link_lookups' per-table section lists the same fields as its Drizzle schema" \
    "awk '/## \`share_link_lookups\`/,/^## \`auth_rate_limit_attempts\`/' docs/data-model.md" \
  --step "auth_rate_limit_attempts' per-table section lists the same fields as its Drizzle schema" \
    "awk '/## \`auth_rate_limit_attempts\`/,/^## \`ai_rate_limit_attempts\`/' docs/data-model.md" \
  --step "ai_rate_limit_attempts' per-table section lists the same fields as its Drizzle schema" \
    "awk '/## \`ai_rate_limit_attempts\`/,/^## Migration strategy/' docs/data-model.md" \
  --step "Sensitivity summary table classifies each table's ip_address / user_id column" \
    "grep -n 'share_link_lookups\|auth_rate_limit_attempts\|ai_rate_limit_attempts' docs/data-model.md | grep '|'" \
  --step "field lists mirror apps/worker/src/lib/db/schema/ (ip_address, endpoint, action_type, user_id columns match)" \
    "grep -n 'ipAddress\|endpoint\|actionType\|userId' apps/worker/src/lib/db/schema/share-link-lookups.ts apps/worker/src/lib/db/schema/auth-rate-limit-attempts.ts apps/worker/src/lib/db/schema/ai-rate-limit-attempts.ts"
