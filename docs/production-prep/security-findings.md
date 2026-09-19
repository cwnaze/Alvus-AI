# Security Findings — Whole-Repo Audit

Scope: dependency vulnerabilities, full git-history secret scan, authorization (route by
route against `docs/security.md`), input validation boundaries, rate limiting, security
headers/CORS, and re-examination of anything previously waved through as "acceptable for
now." Findings-only pass; nothing below has been fixed.

Overall assessment: authorization, RLS, share-link crypto, secret scanning in CI, and
rate limiting are all unusually solid — every mutating route checks `authUser`,
`loadOwnedProject` is used consistently, RLS covers every table (including the
select-grant gap `f7efc7a` just closed), and gitleaks already runs full-history on every
PR. The real gaps found in this pass are a genuine XSS chain through an outdated TipTap
dependency reachable via the unauthenticated share-link page, a quota-bypass race
condition, and a missing security-headers layer.

## Must fix before launch

1. **Vulnerable TipTap version (`@tiptap/*` 3.29.2) is exploitable through the
   unauthenticated share-link page, not just the authenticated editor.**
   - Files: `apps/web/package.json:13-16` (`@tiptap/core`, `@tiptap/pm`,
     `@tiptap/react`, `@tiptap/starter-kit` pinned `^3.29.2`); rendering sites:
     `apps/web/src/editor/DocumentPreview.tsx:20-26` (`useEditor({ extensions:
     [StarterKit, Citation], content, editable: false })`), consumed by
     `apps/web/src/pages/SharedPaperPage.tsx` (unauthenticated share-link view) and
     `apps/web/src/pages/WritingPage.tsx`; also `apps/web/src/editor/DocumentEditor.tsx:51-52`.
     Server side, the stored document is accepted with almost no shape validation:
     `apps/worker/src/routes/editor.ts:35-40` (`parseContent` only checks "is a plain
     object, not an array" — no schema/allowlist on node types or attrs) and served
     back verbatim by `apps/worker/src/routes/shared.ts:45-65`.
   - `npm audit` (root and `apps/web`) reports GHSA-cp6q-959q-f8rh: "Tiptap:
     `mergeAttributes()` turns an own `__proto__` key into inherited executable DOM
     attributes" (CWE-79 XSS / CWE-1321 prototype pollution), affecting installed
     3.29.2 (`fixAvailable`, patched in 3.30.4). `npm audit --omit=dev` confirms this
     is a **production** dependency of `apps/web`, not a dev-only tool.
   - Failure scenario: a project owner (or anyone who can reach `PUT
     /api/projects/:projectId/document` with their own valid JWT — no special
     privilege needed) submits a TipTap document JSON body whose node/mark `attrs`
     contain a `__proto__` key. `parseContent` accepts it (only rejects
     non-object/array), it's stored as-is, and `formatInTextCitation`/rerender paths
     never sanitize node attrs. The next time that document renders through
     `mergeAttributes()` — including on `GET /api/shared/:token`, reachable by
     **any** anonymous visitor holding the share link (e.g., the instructor the
     share-link feature exists for) — the polluted prototype key becomes real DOM
     attributes on rendered elements, i.e. stored XSS executing in the share-link
     visitor's browser session, not just the owner's own. This directly undermines
     `docs/security.md`'s share-link guarantee ("blast radius scoped to one read-only
     paper") since the payload now targets whoever opens that read-only paper.
   - Suggested fix: bump `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`,
     `@tiptap/starter-kit` (and any other `@tiptap/extension-*` pulled in) to
     >=3.30.4 (`npm audit fix` resolves all 26 TipTap advisories in one bump per the
     audit output). Independently, tighten `parseContent` in `editor.ts` to validate
     against an allowlist of expected node/mark types and reject any object key named
     `__proto__`/`constructor`/`prototype` in `attrs`, as defense-in-depth against the
     same class of bug in future TipTap/ProseMirror CVEs.

## Should fix soon

1. **Usage-quota check is TOCTOU-racy — concurrent requests can exceed a tier's
   monthly AI-cost ceiling.**
   - Files: `apps/worker/src/lib/metering/index.ts:39-51` (`checkUsageLimit` reads
     `sumUsage` and compares against the tier limit) and `:70-91` (`recordUsage`
     inserts the usage event only *after* the AI call succeeds) — called from
     `apps/worker/src/routes/sources.ts:294-296` (`/analyze`, `/upload`) and
     `apps/worker/src/routes/feedback.ts:45-47`. No transaction or row lock ties the
     read-check to the eventual insert; they're two independent round trips separated
     by a real network call to the LiteLLM proxy.
   - Failure scenario: a user at N-1 of N monthly `source_analysis` calls fires
     several requests concurrently (multiple browser tabs, or a simple script) against
     different source IDs in the same project, within the same 60s window the
     per-user AI rate limit (`AI_RATE_LIMIT_MAX_REQUESTS = 5`,
     `apps/worker/src/lib/rate-limit/index.ts:124`) still permits. Each request's
     `checkUsageLimit` call reads the same pre-request usage sum (none of the
     concurrent requests' `recordUsage` has landed yet), so all of them pass the
     check and all proceed to bill the LiteLLM proxy, overshooting the monthly quota
     by up to the concurrent-request ceiling every window. This is exactly the
     "AI-cost abuse" threat `docs/security.md` calls out ("hard per-account
     ceiling") — the ceiling is soft under concurrency.
   - Suggested fix: make the check-and-reserve atomic — e.g. a single
     `INSERT ... SELECT` / `WITH` CTE that only inserts the usage event if the
     current period's count is still under the limit, or wrap `checkUsageLimit` +
     `recordUsage` in a transaction using `SELECT ... FOR UPDATE` on a per-user
     counter row. A pessimistic per-user advisory lock (`pg_advisory_xact_lock`) keyed
     on `userId` would also close the window with minimal schema change.

2. **No security-headers layer anywhere in the stack (CSP, X-Frame-Options /
   `frame-ancestors`, X-Content-Type-Options, Referrer-Policy).**
   - Files: `apps/worker/src/index.ts` (no `secureHeaders()` or equivalent Hono
     middleware registered — `app.use('*', requestId(...))` is the only global
     middleware); `wrangler.jsonc` (`assets` block has no `headers` config); no
     `apps/web/public/_headers` file exists (`find` confirmed no `_headers` file
     anywhere in the repo, so Cloudflare's static-asset serving applies no
     custom headers either).
   - Failure scenario, two concrete: (a) clickjacking — with no
     `X-Frame-Options`/`frame-ancestors`, `/shared/:token` (the read-only paper
     view meant to be sent to an instructor, per the product spec) can be embedded
     in a third-party `<iframe>` and overlaid to trick a visitor into actions they
     didn't intend; (b) defense-in-depth for finding #1 above — even after the
     TipTap bump, a CSP with no `unsafe-inline`/`unsafe-eval` and a locked `script-src`
     would have prevented that class of injected-attribute XSS from executing at all,
     which is the standard belt-and-suspenders pairing for exactly this bug class.
   - Suggested fix: add Hono's built-in `secureHeaders()` middleware (or equivalent
     manual headers) globally in `index.ts`, with at minimum `X-Frame-Options: DENY`
     (or `frame-ancestors 'none'` via CSP — `/shared/:token` has no legitimate
     embedding use case per the product spec), `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP scoped to the
     app's own origin plus Stripe.js/Stripe Elements' documented required sources.

3. **`nanoid` high-severity advisory pulled into `apps/web`'s dependency tree.**
   - `npm audit` (apps/web, full including dev): `nanoid <3.3.18` — "custom
     generators can loop indefinitely when size is zero" (GHSA-2v37-7h3g-55p8), high
     severity, `fixAvailable: true`. Transitively pulled in (likely via Vite/Vitest
     tooling, not app code — `grep` found no direct `nanoid` import under
     `apps/web/src` or `apps/worker/src`).
   - Failure scenario: low real-world exploitability here — the bug requires the
     *caller* to invoke nanoid with `size: 0`, which no code in this repo does; this
     is almost certainly a build/dev-tooling transitive dependency, not a runtime
     path reachable by an external attacker. Flagged as should-fix rather than
     must-fix for that reason, but worth clearing via `npm audit fix` since a patch
     is available with no breaking change expected.
   - Suggested fix: `npm audit fix` at the root and confirm which workspace/tool
     pulls it in; pin/override if a transitive bump doesn't resolve it directly.

4. **`drizzle-kit`/`esbuild`/`@esbuild-kit/*`/`wrangler`/`miniflare`/
   `@cloudflare/vitest-pool-workers` moderate advisories are all dev-tooling-only,
   confirm and track, don't block on them alone.**
   - `npm audit --omit=dev` at the repo root and inside `apps/worker` both report
     **zero** vulnerabilities — every one of the 35 root-level findings resolves to a
     `devDependency` (drizzle-kit's bundled esbuild, wrangler/miniflare's own dev
     server). These don't ship to production (the Worker bundle) and aren't
     reachable by an external attacker, but several (`esbuild`'s dev-server
     request-smuggling class of issues in older versions, `wrangler`/`miniflare`
     advisories) are worth clearing opportunistically since `drizzle-kit`'s fix
     requires a semver-major bump (`0.18.1`) — plan that as a deliberate upgrade,
     not urgent.

## Accepted with rationale

1. **No CORS middleware/headers configured anywhere in `apps/worker`.**
   - This is correct as built, not a gap: `wrangler.jsonc` deploys a single Worker
     serving both the built React/Vite static assets and the Hono API from the same
     origin (`assets.directory` + `run_worker_first: ["/api/*"]`), so the frontend
     never makes a cross-origin request to its own API and CORS headers are
     unnecessary. Auth is Bearer-token-in-header (`apps/web/src/lib/api.ts:83`), not
     cookie-based, which also means there's no CSRF exposure from a same-site cookie
     jar even if that assumption changes later. Revisit only if a separate
     origin/mobile client is added that needs to call this API cross-origin.

2. **Local `.env` in the working tree contains real-looking, unredacted credentials
   (Cloudflare API token, Supabase access token + secret key, DATABASE_URL with a
   live-looking password, LiteLLM key, Stripe test-mode secret key/webhook secret).**
   - `git status`/`git check-ignore -v .env` confirm this file is `.gitignore`d
     (`.gitignore:2`) and was never committed — `git log --all -- .env` returns
     nothing, so this is **not** a git-history secret leak, and is out of scope for a
     code fix. Noting it because the task asked to cross-check `.env` explicitly, and
     because `SUPABASE_SECRET_KEY`/`DATABASE_URL` leaking is classified by
     `docs/security.md` itself as "full RLS bypass = treat as a full data breach."
     The Stripe key is `sk_test_...` (test mode, low blast radius); the rest are
     real-shaped values. Recommend rotating the Supabase/Cloudflare/Database
     credentials after this sandbox/CI environment is torn down as routine hygiene,
     since this file's contents were visible to this audit's tooling (and would be to
     any process with filesystem access to this environment) — not because anything
     here indicates they were exfiltrated.

3. **Secret scanning in CI (US-006) is already solid; this pass's manual full-history
   grep found nothing beyond it.**
   - `.github/workflows/ci.yml:34-49` runs gitleaks with `fetch-depth: 0` and
     `--log-opts="HEAD"` as a required check on every PR, `.gitleaks.toml` extends the
     default ruleset with two narrow, well-justified allowlist entries (a
     content-hash cache dir and one historical throwaway test key documented as
     "never protected anything"). A manual `git log --all -p` grep for
     key/secret/token/password assignments with ≥16-char high-entropy values, cross-
     referenced against `.dev.vars`/`.env.example`/`wrangler.jsonc`, turned up nothing
     beyond documented test fixtures (`'ab'.repeat`-style / `Fixture-Passw0rd!`
     patterns) and the already-allowlisted gitleaks self-test string in
     `scripts/demo-us-006-plant-secret.sh`. No action needed.

4. **RLS coverage is complete and the previously-known select-grant gap is already
   closed.**
   - Verified every table in `apps/worker/src/lib/db/schema/` has a corresponding
     `ENABLE ROW LEVEL SECURITY` + explicit policy (or deliberate zero-policy
     deny-all for internal bookkeeping tables) across
     `drizzle/migrations/0011_enable_row_level_security.sql`,
     `0012_burly_makkari.sql`, `0013_add_rate_limit_attempts.sql`, and
     `0014_revoke_default_select_grants.sql` — the last of which (already on `main`
     per the recent `f7efc7a` commit referenced in this repo's own history) fixed
     Supabase's default template blanket-`SELECT`-to-`anon`/`authenticated` grant
     that had been silently sitting underneath the RLS policies. No further action;
     confirmed the fix is real and the grant/policy layers now agree.

5. **`source-uploads` Storage bucket has zero object-level RLS policies (deny-all).**
   - `supabase/migrations/20260806060000_source_uploads_bucket.sql`'s own comment
     flags this as "scaffolding only," pending owner/project-scoped object policies
     that were never subsequently added (confirmed via `grep` — no migration
     anywhere references `storage.objects`). This is safe as-is: the bucket is
     private, has no policies (so RLS denies every anon/authenticated request
     outright), and `apps/worker/src/lib/storage/client.ts` only ever writes via the
     service-role client with the caller's ownership already checked by
     `loadOwnedProject` upstream — matching `docs/security.md`'s "service-role +
     manual checks required" pattern. There is currently no download/read route for
     uploaded originals at all (confirmed via `grep` for
     `createSignedUrl`/`getPublicUrl`/`download` — none exist), so nothing is
     under-protected today. Flagging only so that whoever builds a "view/download
     original upload" feature later reads this: it must go through the service-role
     path with an explicit ownership check, the same way every other service-role
     path in this codebase already does — do not add a public/authenticated Storage
     policy as a shortcut.

## Notes

- Authorization was checked route-by-route against `docs/security.md`'s table for
  every handler in `admin.ts`, `auth.ts`, `billing.ts`, `billing-webhook.ts`,
  `editor.ts`, `feedback.ts`, `projects.ts`, `share-links.ts`, `sources.ts`: every
  mutating/reading route (except the two documented `requireApproved` carve-outs,
  `GET /auth/me` and `POST /auth/logout`, and the two intentionally-unauthenticated
  paths, the Stripe webhook and `/api/shared/:token`) applies
  `authenticate` → `requireApproved`, and every project-scoped route resolves the
  project via `loadOwnedProject` (403 on cross-owner access, 404 on nonexistent/
  malformed id) before touching any child resource (sources, documents, feedback
  passes, share links). `admin.ts` additionally gates on `requireAdmin`. No route was
  found missing its expected auth middleware.
- Input validation: no `zod` (or any schema library) is used anywhere in
  `apps/worker/src/routes/` despite `docs/security.md` citing it as the example tool
  — validation is entirely hand-rolled `typeof`/regex/enum checks. In practice every
  route handler reviewed does validate every field it reads from `req.json()`/query/
  path params before use (title length caps, UUID regex on path params, citation
  format enum, upload MIME+extension double-check, year-range bounds, etc.) — this is
  a documentation-vs-practice mismatch (the doc names a tool that isn't actually
  used), not a missing-validation finding. Worth a docs correction, not a security
  fix.
- Rate limiting (`apps/worker/src/lib/rate-limit/index.ts`) is implemented and
  confirmed wired into every endpoint it's meant to guard: per-IP on
  signup/login/password-reset-request (`routes/auth.ts`), per-user AI-rate-limit on
  `/analyze`, `/upload`, and feedback pass creation (checked *and recorded* before
  the AI call in every case), per-user burst limit on `/document/suggestions`, and
  per-IP on the share-link lookup endpoint (`routes/shared.ts`). No expensive/public
  endpoint was found unguarded.
- Stripe webhook handler correctly verifies the signature over the raw body
  (`c.req.text()`) before any parsing or DB write, and correctly runs unauthenticated
  by design on its own router (`billing-webhook.ts`) mounted separately from
  `billing.ts` so it never inherits `authenticate`/`requireApproved` — matches
  `docs/security.md` exactly. `confirmCheckoutSession`
  (`apps/worker/src/lib/stripe/checkout.ts`) independently validates
  `client_reference_id`/`metadata.user_id` against the caller before trusting a
  session, so a user can't confirm someone else's checkout session by guessing/
  reusing a `session_id`.
- Share-link tokens are 256-bit random (`crypto.getRandomValues`, well above the
  documented 128-bit floor), stored only as a SHA-256 hash (lookup) plus
  AES-GCM ciphertext under a Worker-only key (owner redisplay) — never plaintext at
  rest — and lookups are rate-limited per-IP. This matches `docs/security.md`'s
  threat note precisely; no issues found here.
- AI prompt construction (`apps/worker/src/lib/ai/prompts.ts`) structurally separates
  `system`/`user` roles for every call site (analysis, suggestions, feedback) and the
  system prompts explicitly instruct "never write or suggest prose for the user's own
  paper" — consistent with `docs/security.md`'s prompt-injection guidance treating
  quoted source/document text as data, not instructions. No raw string concatenation
  of untrusted content into a single unstructured prompt was found.
- `gh api repos/cwnaze/Alvus-AI/dependabot/alerts` returned 403 "Dependabot alerts are
  disabled for this repository" — could not cross-check GitHub's own advisory feed;
  this ran with the current token's permissions only, note for whoever has repo-admin
  access to enable Dependabot alerts if not already a deliberate choice.
