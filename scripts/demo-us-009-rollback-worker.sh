#!/usr/bin/env bash
# Helper for scripts/demo-us-009.sh: exercises the real `wrangler rollback`
# mechanism end-to-end -- deploy a good version, deploy a deliberately-broken
# version, confirm it's broken, roll back, confirm the previous version is
# serving again -- against a disposable scratch Worker, never the real
# `alvus-ai` production Worker, so this demo can't cause a real outage. The
# scratch Worker is deleted on exit either way.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$repo_root/.env"
worker_name="alvus-ai-rollback-demo"
scratch="$(mktemp -d)"

cleanup() {
  rm -rf "$scratch"
  npx wrangler delete --name "$worker_name" --env-file "$env_file" >/dev/null 2>&1 < /dev/null || true
}
trap cleanup EXIT

# Cloudflare's edge takes a few seconds to converge a new deployment across
# every PoP, so the first request or two after a deploy can still hit a stale
# node -- poll for consecutive matches rather than trusting a single response
# (demo determinism rule: wait on state, never on time).
wait_for_status() {
  local url="$1" want="$2" needed=3 streak=0 attempt=0 code=""
  while [ "$attempt" -lt 40 ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
    if [ "$code" = "$want" ]; then
      streak=$((streak + 1))
      if [ "$streak" -ge "$needed" ]; then
        echo "$url -> HTTP $code ($streak consecutive requests)"
        return 0
      fi
    else
      streak=0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  echo "TIMED OUT waiting for $url to return $want consistently (last saw $code)" >&2
  return 1
}

cat > "$scratch/good.js" <<'EOF'
export default {
  fetch() {
    return new Response("ok", { status: 200 });
  },
};
EOF

cat > "$scratch/broken.js" <<'EOF'
export default {
  fetch() {
    throw new Error("deliberately broken for US-009 rollback demo");
  },
};
EOF

echo "=== 1. Deploying the good version to a scratch Worker ==="
good_deploy_out="$(npx wrangler deploy "$scratch/good.js" --name "$worker_name" --compatibility-date 2024-09-23 --env-file "$env_file")"
echo "$good_deploy_out"
worker_url="$(echo "$good_deploy_out" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$worker_url" ] || { echo "could not parse the scratch Worker's URL from deploy output" >&2; exit 1; }

echo
echo "=== 2. Confirming the good version serves 200 ==="
wait_for_status "$worker_url" 200

echo
echo "=== 3. Recording the good deployment's Version ID ==="
good_version="$(npx wrangler deployments list --name "$worker_name" --env-file "$env_file" | grep -oE '\(100%\) [0-9a-f-]{36}' | tail -1 | awk '{print $2}')"
[ -n "$good_version" ] || { echo "could not parse the good deployment's Version ID" >&2; exit 1; }
echo "Good Version ID: $good_version"

echo
echo "=== 4. Deploying a deliberately-broken version ==="
npx wrangler deploy "$scratch/broken.js" --name "$worker_name" --compatibility-date 2024-09-23 --env-file "$env_file"

echo
echo "=== 5. Confirming the broken version now serves an error ==="
wait_for_status "$worker_url" 500

echo
echo "=== 6. Rolling back to the last good Version ID ==="
npx wrangler rollback "$good_version" --name "$worker_name" --env-file "$env_file" --message "US-009 demo rollback" -y < /dev/null

echo
echo "=== 7. Confirming the previous version is serving again ==="
wait_for_status "$worker_url" 200

echo
echo "PASS: wrangler rollback restored the previous working version."
