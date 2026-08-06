#!/usr/bin/env bash
# Proves US-006's AC: secret scanning (gitleaks) runs in CI and fails the build on a
# match. Installs the same pinned gitleaks version ci.yml's "Secret scan (gitleaks)"
# step uses, runs it against this repo's real history (clean), then plants a fake
# secret in a scratch git repo to prove a match makes gitleaks exit non-zero, which is
# what fails the required "check" job. Re-run this to regenerate docs/demos/US-006.md.
set -euo pipefail
cd "$(dirname "$0")/.."

GITLEAKS_VERSION=8.30.1
GITLEAKS_BIN="$(mktemp -d)/gitleaks"
curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  | tar -xz -C "$(dirname "$GITLEAKS_BIN")" gitleaks
export GITLEAKS_BIN

node e2e/demo-command.mjs US-006 "Secret scanning in CI" \
  --step "ci.yml's required check job runs gitleaks against every PR" \
    "grep -A8 'Secret scan (gitleaks)' .github/workflows/ci.yml" \
  --step "Scan this repo's real commit history — no leaks" \
    "\$GITLEAKS_BIN detect --source . --config .gitleaks.toml --redact --no-banner --no-color 2>&1" \
  --step "Plant a fake secret in a scratch repo and confirm gitleaks fails the build on a match" \
    "./scripts/demo-us-006-plant-secret.sh"
