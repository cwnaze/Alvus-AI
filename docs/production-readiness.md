# Production Readiness — Alvus AI

Whole-repo audit run after all 30 stories (US-001–US-030) reached `done`. Four
independent passes (security, code health, operational readiness, documentation/DX)
plus full verification (typecheck, lint, build, unit/integration suite, production-build
demo suite). This report is the terminus of the pipeline; see `docs/pipeline-log.md` for
story history.

## Verification summary

- `npm run typecheck` — pass (all 4 workspaces).
- `npm run lint` — pass, 0 errors (1 pre-existing warning: `AuthContext.tsx` fast-refresh export rule).
- `npm run build` — pass. Bundle warning: `apps/web`'s single JS chunk is 671KB (207KB
  gzip), over Vite's 500KB default warning threshold. Not a correctness issue; worth a
  should-fix (dynamic `import()` for the editor/TipTap bundle) if initial load time
  matters at launch.
- `npm test` (Vitest unit + `@cloudflare/vitest-pool-workers` integration + RLS suite) —
  **379/379 pass** (365 worker/web unit+integration, 14 RLS integration).
- Playwright demo suite (`CI=true npx playwright test`, production build served by
  `wrangler dev`, matching the deploy target) — **11/16 pass**. See must-fix #2 below for
  the 5 failures and why they were not written off as flake.

## Must fix before launch

### 1. Vulnerable TipTap version is exploitable through the unauthenticated share-link page
`@tiptap/*` pinned to `^3.29.2` in `apps/web/package.json`. `npm audit` reports
GHSA-cp6q-959q-f8rh: `mergeAttributes()` turns an own `__proto__` key into inherited
executable DOM attributes (XSS / prototype pollution), fixed in 3.30.4. The stored
document is accepted with no attrs schema validation
(`apps/worker/src/routes/editor.ts:35-40`'s `parseContent` only checks "is a plain
object") and rendered verbatim on `GET /api/shared/:token` — reachable by any anonymous
visitor holding a share link, not just the document owner. This directly undermines
`docs/security.md`'s share-link blast-radius guarantee.

**Fix**: bump all `@tiptap/*` packages to >=3.30.4 (`npm audit fix` resolves all 26
related advisories). Defense-in-depth: reject `__proto__`/`constructor`/`prototype` keys
in `parseContent`'s attrs allowlist.

- Files: `apps/web/package.json:13-16`, `apps/worker/src/routes/editor.ts:35-40`,
  `apps/worker/src/routes/shared.ts:45-65`

### 2. No global timeout on database queries — requests can hang indefinitely with zero error surfaced
Found live during this pass's own verification run, not just inferred: 5 of 16 Playwright
demo specs (`US-016`, `US-017`, `US-018`, `US-023`, `US-029`) failed with a request that
never returns — no error, no timeout, no log line — leaving the UI stuck on a disabled
button or spinner forever. This was run down past "probably flaky infra":

- `US-018`'s failure is a raw `page.request.put` — Playwright's `APIRequestContext`
  talking directly to the Worker's HTTP port, bypassing all frontend JS entirely — that
  hung for the full 30s test timeout with no response. This rules out a frontend bug for
  at least this instance.
- `US-017`'s trace shows the upload's `POST .../sources/upload` completing correctly
  (201, and the stored analysis record confirmed correct — right citation, right
  `state: "selected"`), then the immediate follow-up `GET .../bibliography` recorded with
  `status: -1` (no response ever received) in the trace network log.
- The pattern in all 5 cases: the hung request follows shortly after a multi-second
  AI-analysis-latency call (source analysis, upload+analyze, feedback pass). One full-suite
  run also saw `wrangler dev` itself crash outright mid-suite with a blank `✘ [ERROR]`.
- This lines up with a race the codebase's own comments already flag as known and
  worked around in one place but not others:
  `apps/worker/src/index.ts:55-58`'s health-check deliberately does **not** close its DB
  connection, commented *"closing it races the Workers postgres.js polyfill's background
  stream read."* That workaround exists for exactly one call site. Every other route that
  calls `db.execute`/Drizzle (`lib/rate-limit`, `lib/metering`, `lib/db/queries/*`) has no
  equivalent protection and no query/connection timeout at all — unlike every other
  external call in this codebase, which all have explicit timeouts
  (`lib/net/fetch-with-retry.ts` for academic APIs, `lib/ai/client.ts`'s 20s LiteLLM
  timeout). The operational-readiness pass independently flagged the narrower version of
  this (missing timeout on `/api/health`'s DB call) as should-fix; this pass's live
  reproduction across 5 unrelated demo specs promotes it to must-fix: a stuck Postgres
  connection under the Workers `postgres.js` polyfill can hang **any** authenticated
  route, not just health checks, with nothing surfaced to the user or logged for an
  operator — a direct violation of this project's own "errors surface to the user
  meaningfully; a blank screen is a bug" convention.

**Fix**: add an explicit statement/connection timeout to the shared `postgres()` client
in `apps/worker/src/lib/db/client.ts` (or wrap every `db.execute`/query call the way
`fetch-with-retry.ts` wraps external calls), so a stuck connection fails fast into a
clean 503 instead of hanging the request forever. Root-causing the underlying
`postgres.js`/Miniflare interaction is follow-up work; the timeout is the
user/operator-facing fix regardless of root cause.

- Files: `apps/worker/src/lib/db/client.ts`, `apps/worker/src/index.ts:54-67`,
  `apps/worker/src/middleware/errors.ts:38-51` (also never logs `AppError`s — see should-fix)
- New stories filed for this: see `stories.json` (US-031, US-032)

### 3. `docs/security.md`'s Authorization section describes an enforcement path the app does not use
The doc states RLS (`auth.uid() = owner_id` policies via `supabase-js` with the caller's
JWT) is the enforcement boundary for project/source access. The app does not do this —
every route connects as the `postgres` role over `DATABASE_URL` and enforces ownership
via explicit app-layer checks (`loadOwnedProject`). RLS is a secondary, independently
-tested backstop (US-026), not the live control. A security reviewer or incident
responder relying on this doc would look in the wrong place.

**Fix**: rewrite the Authorization section to describe the real model (see
`docs/production-prep/docs-dx-findings.md` finding 1 for the full detail and citations).

- File: `docs/security.md`

### 4. `docs/data-model.md` is missing three live tables
`share_link_lookups`, `auth_rate_limit_attempts`, `ai_rate_limit_attempts` (all added by
US-027, all live in the schema and migrations) are absent from the doc and its ER
diagram, including their PII-adjacent (IP address) sensitivity classification.

**Fix**: add all three tables' field lists and sensitivity rows (mirrors schema files
closely). See `docs/production-prep/docs-dx-findings.md` finding 2.

- File: `docs/data-model.md`

## Should fix soon

1. **Usage-quota check is TOCTOU-racy** — concurrent requests can exceed a tier's
   monthly AI-cost ceiling (`apps/worker/src/lib/metering/index.ts:39-51,70-91`). Fix:
   atomic check-and-reserve (CTE or `pg_advisory_xact_lock`).
2. **No security-headers layer** (CSP, `X-Frame-Options`, `X-Content-Type-Options`,
   `Referrer-Policy`) anywhere in the stack — `/shared/:token` is clickjackable, and a
   locked CSP would be belt-and-suspenders for must-fix #1's bug class. Add Hono's
   `secureHeaders()` globally in `apps/worker/src/index.ts`.
3. **`nanoid` high-severity advisory** in `apps/web`'s dev-tooling dependency tree
   (`npm audit fix`); low real-world exploitability (requires caller-supplied `size: 0`,
   not used anywhere in this repo).
4. **Dev-tooling-only moderate advisories** (`drizzle-kit`/`esbuild`/`wrangler`/
   `miniflare`) — `npm audit --omit=dev` is clean; track and clear opportunistically,
   `drizzle-kit`'s fix needs a deliberate semver-major bump.
5. **Structured logging gaps**: `onError` never logs `AppError` instances (only
   unhandled `Error`s), so every 5xx-class provider failure, rate-limit trip, and failed
   login currently produces zero server-side log line. Individual provider failures in
   `lib/sources` (Semantic Scholar/CrossRef/Unpaywall) are also silently swallowed with
   no log line even though the graceful-degradation behavior itself is correct. Two
   remaining plain-string (non-JSON, no correlation ID) log call sites:
   `apps/worker/src/index.ts:64`, `apps/worker/src/routes/auth.ts:174`.
6. **Dead feature scaffolding**: `projects.status` lifecycle (`draft/in_progress/
   completed/archived`) is fully modeled, stored, indexed, and shipped over the wire, but
   no route or UI ever transitions or reads it. Either implement the transition or remove
   the field until there's a use for it.
7. **20MB upload limit is a magic number duplicated three times** (twice in
   `sources.ts`, once in `ProjectPage.tsx`) instead of one shared constant in
   `packages/shared`.
8. **`docs/tdd.md` directory-layout drift**: lists `routes/analysis.ts` and
   `routes/webhooks.ts` (don't exist; the real files are `sources.ts` and
   `billing-webhook.ts`), omits `admin.ts`/`share-links.ts`/`shared.ts` and several real
   `lib/` subdirectories (`rate-limit/` notably — backs all of US-027), and describes a
   `middleware/`-based usage-limit gate that doesn't exist (it's called per-route, not as
   middleware).
9. **README's `supabase start` should be `npx supabase start`** to match
   `pipeline.json`'s canonical command and avoid a "command not found" on a clean clone
   without a global Supabase CLI install.
10. **`docs/security.md`'s secret classification table omits `SHARE_LINK_ENCRYPTION_KEY`**
    despite the same doc treating it as critically sensitive elsewhere.
11. **`SUPABASE_PUBLISHABLE_KEY` documented as in-use but is dead configuration** — no
    client in the codebase is built with it. Either wire it up or mark it reserved/unused
    in `.env.example`/`docs/infra.md`.
12. **Required secrets aren't validated at startup** — found during this pass's own
    verification: a missing `SHARE_LINK_ENCRYPTION_KEY` doesn't fail fast with a clear
    config error, it crashes deep in `apps/worker/src/lib/share-links/token.ts`'s
    `fromHex` with `Cannot read properties of undefined (reading 'length')` on first use.
    Validate required env bindings once at the top of the request lifecycle (or on boot)
    and return a clear 500 with an actionable message instead.
13. **Documented Storage backup mitigation (bucket versioning / periodic export) is
    planned but not implemented** — `docs/infra.md`/`README.md` note the gap explicitly
    as a pre-scale item; turn it into an actual story before upload volume makes it
    painful to build under pressure.
14. **Bundle size**: `apps/web`'s single JS chunk is 671KB — consider code-splitting the
    TipTap editor behind a dynamic `import()`.

## Accepted with rationale

- **No CORS middleware** — correct as built; single-Worker same-origin deploy, Bearer-token auth (no cookie/CSRF exposure).
- **Local `.env` has real-looking unredacted credentials** — gitignored, never committed, not a git-history leak; recommend rotating Supabase/Cloudflare/DB credentials as routine hygiene after this environment is torn down.
- **Secret scanning (US-006, gitleaks full-history) is solid** — manual re-scan found nothing beyond it.
- **RLS coverage is complete**, including the previously-known select-grant gap (`f7efc7a`, already closed).
- **`source-uploads` Storage bucket has zero object-level policies** — correct deny-all; no download route exists yet; flagged only so a future upload-download feature goes through the existing service-role + ownership-check pattern.
- **Citation formatting, AI client, and metering/rate-limiting are all single-sourced** — verified, not duplicated across stories despite being the category most likely to have drifted.
- **Error handling is consistently funneled through `AppError`/`onError`** across every route file.
- **Graceful shutdown**: not applicable — Workers isolates have no traditional process lifecycle; the codebase's one-connection-per-request DB pattern is a deliberate, correct adaptation.
- **Migration rollback**: tested for the one migration that needed it (`0000`, the only one with a `DROP`); the other 14 are additive/non-destructive by policy, so the absence of down-migrations for them is the policy working as designed, not a gap.
- **Backup/restore for Postgres and Storage is documented as a dated, explicit bootstrap-budget tradeoff**, not an oversight — only the "bucket versioning" half is unactioned (see should-fix #13).
- **Env var documentation is in lockstep** (`scripts/check-env-docs.mjs`, 26/26) apart from should-fix #11's `SUPABASE_PUBLISHABLE_KEY`/`STRIPE_PUBLISHABLE_KEY` gap, both plausibly forward-looking and neither a functional issue today.
- **`docs/api.md`, `docs/data-model.md`'s schema fields (apart from must-fix #4), `docs/infra.md`, and `docs/testing.md`** were all cross-checked against actual code/config and found accurate.
- **Demo doc / spec correspondence** — all 30 stories have both a demo doc and (where applicable) a spec file on disk; no missing files found.
- **AI prompt construction structurally separates system/user roles** and treats quoted source/document text as data, not instructions — consistent with the documented prompt-injection guidance.
- **Stripe webhook and checkout-session confirmation are both correctly hardened** — signature verified before parsing, session ownership independently validated.
- **Share-link tokens**: 256-bit random, hashed for lookup, encrypted-at-rest for owner redisplay, rate-limited per-IP — matches the documented threat model exactly.

## Notes

- Full findings detail, including file:line citations and additional verified-clean
  areas not summarized above, are preserved in `docs/production-prep/`:
  `security-findings.md`, `code-health-findings.md`,
  `operational-readiness-findings.md`, `docs-dx-findings.md`.
- `gh api repos/cwnaze/Alvus-AI/dependabot/alerts` returned 403 (Dependabot alerts
  disabled for this repo) — could not cross-check GitHub's own advisory feed; enable if
  not already a deliberate choice.
- No separate staging environment exists by design (`docs/infra.md`: per-PR preview
  deploys via `deploy-preview.yml` cover that need at this scale). This report's
  verification instead ran the full demo suite against a `wrangler dev` instance serving
  the actual production build (`CI=true npx playwright test`), matching the single-Worker
  deploy target as closely as possible without a live Cloudflare deploy. Opening this
  branch's PR will trigger a real preview deploy per the existing pipeline — worth a
  manual smoke test there given must-fix #2 was only caught under sustained local load.
