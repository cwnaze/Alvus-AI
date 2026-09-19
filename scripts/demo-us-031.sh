#!/usr/bin/env bash
# Proves US-031's ACs: @tiptap/* is bumped past the version that patches
# GHSA-cp6q-959q-f8rh (the mergeAttributes() __proto__ XSS/prototype-pollution
# advisory), npm audit no longer reports it, and editor.ts's parseContent
# independently rejects a __proto__/constructor/prototype key anywhere in a
# TipTap document as defense-in-depth.
# Re-run this to regenerate docs/demos/US-031.md.
set -euo pipefail
cd "$(dirname "$0")/.."

node e2e/demo-command.mjs US-031 "Bump vulnerable TipTap dependencies and harden document content validation" \
  --step "@tiptap/core, @tiptap/pm, @tiptap/react, and @tiptap/starter-kit are all resolved past 3.30.4, the version GHSA-cp6q-959q-f8rh was patched in" \
    "node -e \"const {execSync}=require('child_process');const need=['@tiptap/core','@tiptap/pm','@tiptap/react','@tiptap/starter-kit'];const min=[3,30,4];const tree=JSON.parse(execSync('npm ls '+need.join(' ')+' --json --workspace apps/web',{encoding:'utf8'}));let fail=false;for(const p of need){const v=tree.dependencies['@alvus-ai/web'].dependencies[p].version;const parts=v.split('.').map(Number);const ok=parts[0]>min[0]||(parts[0]===min[0]&&(parts[1]>min[1]||(parts[1]===min[1]&&parts[2]>=min[2])));console.log((ok?'PASS':'FAIL')+': '+p+'@'+v+' >= 3.30.4');if(!ok)fail=true;}if(fail)process.exit(1);\"" \
  --step "npm audit no longer reports GHSA-cp6q-959q-f8rh or any other TipTap/prosemirror advisory (remaining findings are unrelated dev-tooling transitive deps, out of scope for this story)" \
    "node -e \"const {execSync}=require('child_process');let out='';try{out=execSync('npm audit --json',{encoding:'utf8'})}catch(e){out=e.stdout||''}const r=JSON.parse(out);const vulns=Object.keys(r.vulnerabilities||{});const bad=vulns.filter(n=>/tiptap|prosemirror/i.test(n));console.log('npm audit vulnerable packages: '+(vulns.join(', ')||'none'));if(bad.length){console.log('FAIL: tiptap/prosemirror advisory present: '+bad.join(', '));process.exit(1);}console.log('PASS: no tiptap/prosemirror advisories ('+vulns.length+' unrelated dev-tooling advisories present)');\"" \
  --step "editor.ts's parseContent rejects a __proto__/constructor/prototype key anywhere in a submitted TipTap document (node root or nested node/mark attrs), independent of the upstream dependency patch, while still accepting ordinary documents" \
    "npm run test --workspace apps/worker -- editor.test.ts --reporter=verbose"
