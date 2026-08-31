#!/usr/bin/env bash
# Proves US-030's ACs: README documents setup/running/tests/deploying matching what CI
# actually does, every .env.example variable has a purpose note (in docs/infra.md),
# an architecture/decisions doc is linked from the README, and the backup/restore
# procedure is documented. Re-run this to regenerate docs/demos/US-030.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-030 "README and docs finalized" \
  --step "README documents setup (install/serve.dev from pipeline.json), running tests, and deploying" \
    "grep -n '^## ' README.md" \
  --step "The Deploying section matches what CI actually runs -- the same workflow files" \
    "grep -n 'deploy-preview.yml\|deploy.yml' README.md" \
  --step "README links an architecture/decisions doc for anyone picking up the project later" \
    "grep -n 'docs/tdd.md' README.md" \
  --step "Backup/restore procedure is documented, flagged as a pre-scale operational runbook item" \
    "grep -n 'operational runbook item to revisit before scaling past bootstrap budget' README.md" \
  --step "Every environment variable in .env.example has a one-line purpose note in docs/infra.md" \
    "node scripts/check-env-docs.mjs"
