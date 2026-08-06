#!/usr/bin/env bash
# Helper for scripts/demo-us-006.sh: plants a fake secret in a scratch git repo and
# confirms gitleaks fails the build on it (non-zero exit), the same way ci.yml's
# "Secret scan (gitleaks)" step would fail the required check on a real PR.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

cd "$scratch"
git init -q
git config user.email t@t.com
git config user.name t
cp "$repo_root/.gitleaks.toml" .
# A generic high-entropy string, not a real provider's key format — GitHub's
# server-side push protection blocks pushes containing recognizable provider
# key shapes (e.g. Stripe's sk_live_ prefix) even inside a throwaway fixture.
# The trailing gitleaks:allow keeps this line itself out of the scan below,
# since it's the fixture, not a leak — the finding this step checks for is
# gitleaks re-detecting it once it's copied into secret.js in $scratch.
echo 'const demoApiKey = "zXk9pQ2vN8mR5tY7wA1bC4dF6gH0jL3nP9qS2uV5xZ8aB1cD4eF7gH0jK3mN6pQ9r";' > secret.js  # gitleaks:allow
git add .
git commit -q -m oops

if "$GITLEAKS_BIN" detect --source . --config .gitleaks.toml --redact --no-banner --no-color; then
  echo "FAIL: gitleaks did not detect the planted secret" >&2
  exit 1
fi
echo "gitleaks exited non-zero on the planted secret, as expected"
