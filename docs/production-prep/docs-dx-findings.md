# Documentation & DX audit — findings

Scope: README setup/run/test/deploy accuracy, architecture docs (`tdd.md`, `infra.md`,
`data-model.md`, `api.md`) vs. actual code, demo doc/spec correspondence, and currency
of `testing.md`/`security.md`. Findings-only pass — nothing here has been fixed.

## Must fix before launch

### 1. `docs/security.md`'s Authorization section describes an enforcement path the app does not use
`docs/security.md` → "Authorization per resource" states: *"**anon-key + RLS** (RLS is
the enforcement): all user-initiated project/source CRUD via `supabase-js` with the
user's own JWT. Policies: `auth.uid() = owner_id` AND `users.status = 'approved'`."*

This is not what the code does. Every route (`apps/worker/src/routes/projects.ts`,
`sources.ts`, `editor.ts`, etc.) opens a Drizzle connection via `createDb(c.env.DATABASE_URL)`
and enforces ownership with an explicit app-layer check (`loadOwnedProject`, etc.) —
there is no `supabase-js` client anywhere in the codebase that uses a caller's JWT or
the publishable/anon key. `apps/worker/src/lib/supabase/client.ts` only ever builds a
**service-role** client (`createSupabaseAdmin`), used solely for Auth operations
(sign-in, sign-out, admin user management) — never for reading/writing app tables.

The migration that enables RLS says so explicitly
(`drizzle/migrations/0011_enable_row_level_security.sql`): *"Writes are never granted
to anon/authenticated at all: the app performs every mutation over `DATABASE_URL` as
the `postgres` role (service-role path, RLS-bypassing by ownership...)."* RLS + the
SELECT grants are a defense-in-depth backstop for a hypothetical direct anon-key read
path that doesn't currently exist in the app (confirmed by US-026's RLS integration
suite, which tests RLS in isolation via direct Postgres roles/JWTs, not through the
Worker). US-025's own story notes acknowledge this explicitly: *"consistent with how
this codebase already does manual per-request ownership checks rather than the
anon-key+RLS path docs/data-model.md originally sketched."*

`docs/data-model.md`'s own intro line ("supabase-js stays scoped to Auth and Storage,
never used to read/write app tables directly") is accurate — it's `security.md`'s
Authorization table that's stale/aspirational. Anyone reading `security.md` alone would
believe RLS is the live enforcement boundary for project/source access; it is not — the
Hono route handlers' ownership checks are. This matters for a security audit or
incident response: the actual control to review/test is app-layer ownership checks +
`requireApproved` middleware, not RLS policies.

**Fix direction**: Rewrite the Authorization section to state the real model — Worker
connects as `postgres` over `DATABASE_URL`; authorization is enforced by explicit
per-route ownership checks (name the helper, e.g. `loadOwnedProject`) plus
`requireApproved`/`authenticate` middleware; RLS + grants are a secondary,
independently-tested backstop (link to US-026) that would matter only if a direct
anon/publishable-key path is ever added. Also flag that `SUPABASE_PUBLISHABLE_KEY` is
currently unused dead config (see finding 3 below) — it's the key the current doc
implies is in active use.

- File: `docs/security.md` (Authorization per resource section)
- Also touches: `docs/data-model.md` (Migration strategy section, which correctly says
  RLS is hand-written SQL but doesn't call out that it's not the app's live enforcement
  path)

### 2. `docs/data-model.md` is missing three tables that exist in the schema and in committed migrations
The Drizzle schema (`apps/worker/src/lib/db/schema/index.ts`) and applied migrations
(`drizzle/migrations/0010_add_share_link_lookups.sql`,
`0013_add_rate_limit_attempts.sql`) define three tables that `docs/data-model.md`
never documents, and that are absent from its ER diagram:

- `share_link_lookups` (`apps/worker/src/lib/db/schema/share-link-lookups.ts`) — IP-keyed
  rate-limit log for the share-link read path.
- `auth_rate_limit_attempts` (`.../schema/auth-rate-limit-attempts.ts`) — IP-keyed log
  for signup/login/password-reset-request rate limiting.
- `ai_rate_limit_attempts` (`.../schema/ai-rate-limit-attempts.ts`) — user-keyed log for
  the analyze/feedback per-user rate limit.

All three were added by US-027 (rate limiting) and are live in the seeded/CI schema
(confirmed via `drizzle/migrations` and `0014_revoke_default_select_grants.sql`, which
explicitly manages grants for `ai_rate_limit_attempts` and `share_link_lookups`/
`auth_rate_limit_attempts`). `docs/data-model.md` was never updated after that story
landed, so a reader relying on it to understand the schema would miss three real tables
entirely, including their sensitivity classification (all three hold IP addresses,
which is PII-adjacent and arguably belongs in the Sensitivity summary table).

**Fix direction**: Add all three tables to the ER diagram and per-table sections
(field lists mirror the schema files closely — straightforward port), and add rows to
the Sensitivity summary table (IP address = sensitive, service-role-only per the
migration comments).

- File: `docs/data-model.md`

## Should fix soon

### 3. `SUPABASE_PUBLISHABLE_KEY` is documented as in-use but is dead configuration
`.env.example` and `docs/infra.md`'s App runtime table both describe
`SUPABASE_PUBLISHABLE_KEY` as used "server-side in the Worker's `supabase-js` client;
requests run under the user's RLS session." No such client exists — grepping the
worker source for `SUPABASE_PUBLISHABLE_KEY` and for any `supabase-js` client built
with an anon/publishable key returns nothing; the only `supabase-js` client in the
codebase (`apps/worker/src/lib/supabase/client.ts`) is built with `SUPABASE_SECRET_KEY`
only, and the Worker's `Bindings` type in `apps/worker/src/index.ts` doesn't even
declare `SUPABASE_PUBLISHABLE_KEY` as a binding. This is the same root cause as finding
1 (the anon-key+RLS path was designed but never built) surfacing as an operational
loose end: an env var that ops will faithfully provision and rotate for a purpose the
app doesn't fulfill.

**Fix direction**: Either wire it up (build a per-request anon-key client if a future
story needs one) or remove it from `.env.example`/`docs/infra.md` and note in
`docs/security.md`/`docs/infra.md` that it's reserved/unused. Don't leave the
"currently used for X" claim in place if X isn't true.

- Files: `.env.example`, `docs/infra.md` (App runtime env var table)

### 4. `docs/tdd.md`'s directory layout lists route files that don't exist and omits ones that do
Under `apps/worker/src/routes/`, `docs/tdd.md` lists:
- `analysis.ts` — does not exist. Per-source AI analysis (`POST
  .../sources/:sourceId/analyze`) actually lives in `apps/worker/src/routes/sources.ts`
  (confirmed: `sources.post('/:sourceId/analyze', ...)` at line 404).
- `webhooks.ts` — does not exist. The actual file is
  `apps/worker/src/routes/billing-webhook.ts`, mounted at `/api/billing` (so the live
  path is `POST /api/billing/webhook`, matching `docs/api.md` correctly).

Not listed at all, despite existing and being real, routed files:
`admin.ts`, `share-links.ts`, `shared.ts`.

The architecture ASCII diagram in the same file also shows a standalone `/webhooks/*`
prefix alongside `/api/*` on the Worker box; there is no such prefix — the Stripe
webhook is mounted under `/api/billing/webhook`, same as every other API route.

**Fix direction**: Regenerate the directory-layout block and the ASCII diagram against
the actual `apps/worker/src/routes/` listing. Low effort, but as-is this file would
actively mislead someone looking for the analyze handler or configuring the Stripe
Dashboard webhook URL.

- File: `docs/tdd.md` (Component boundaries / directory layout section, Architecture
  ASCII diagram)

### 5. `docs/tdd.md`'s `lib/` listing is stale relative to what US-027/US-028 added
The same directory-layout block lists `lib/db`, `lib/supabase`, `lib/ai`,
`lib/sources`, `lib/citation`, `lib/metering`, `lib/stripe`. Actual
`apps/worker/src/lib/` also contains `share-links/`, `storage/`, `net/`, `document/`,
`files/`, and `rate-limit/` — none mentioned. `rate-limit/` in particular backs an
entire story's worth of behavior (US-027) and isn't discoverable from this doc at all.

**Fix direction**: Add the missing directories with a one-line purpose each, same style
as the existing entries.

- File: `docs/tdd.md`

### 6. `docs/tdd.md`'s middleware description doesn't match what's in `middleware/`
The directory layout describes `middleware/` as "Supabase JWT auth guard, usage-limit
gate, errors." The actual directory
(`apps/worker/src/middleware/`) contains only `auth.ts` and `errors.ts` — there is no
usage-limit-gate middleware file. Usage-limit checking (`lib/metering`) and rate
limiting (`lib/rate-limit`) are both called explicitly from inside route handlers, not
implemented as Hono middleware. The doc's wording implies a third middleware file that
doesn't exist.

**Fix direction**: Reword to "auth guard (JWT verification, waitlist-status gate),
errors (correlation ID, error envelope)" and clarify usage-limit/rate-limit checks are
invoked per-route from `lib/metering`/`lib/rate-limit`, not middleware.

- File: `docs/tdd.md`

### 7. README's local-dev Supabase command doesn't match the pipeline's canonical command
README's Development section says:
```
supabase start           # local Docker Postgres, only if not using the shared dev project
```
`pipeline.json`'s `services` field (the canonical source per `CLAUDE.md`) is `npx
supabase start`, and every CI workflow (`ci.yml`, `deploy.yml`) invokes it the same way
via `npx`. A clean-clone developer without the Supabase CLI installed globally, who
follows the README literally, gets `command not found`. `npx supabase start` works
regardless of whether the CLI is globally installed.

**Fix direction**: Change README's `supabase start` to `npx supabase start` (or note
that a global install works as an alternative to `npx`, if that's intentional).

- File: `README.md` (Development section)

### 8. `docs/security.md`'s secret classification table omits `SHARE_LINK_ENCRYPTION_KEY`
The table lists CI secrets and app-runtime secrets (`SUPABASE_SECRET_KEY`,
`DATABASE_URL`, `LITELLM_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`SEMANTIC_SCHOLAR_API_KEY`) but never lists `SHARE_LINK_ENCRYPTION_KEY`, despite the
same document's own "Share-link brute force/leak" threat note treating it as
critically sensitive ("a raw DB read alone... doesn't hand over live tokens... only the
app holding `SHARE_LINK_ENCRYPTION_KEY` can" decrypt them), and `docs/data-model.md`
independently calling the `share_links` table's encrypted column "credential-
equivalent." A secret this consequential (its compromise defeats the one-way-hash
design entirely) belongs in the same classification table as the other sensitive
runtime secrets for consistency and so a security reviewer scanning that one table
doesn't miss it.

**Fix direction**: Add a row: `SHARE_LINK_ENCRYPTION_KEY | App runtime (sensitive) |
Never | No`.

- File: `docs/security.md` (Secret classification table)

## Accepted with rationale

### 9. `docs/api.md` route table vs. actual routes — no drift found, worth recording as verified
Every route documented in `docs/api.md` was cross-checked against the actual `.post`/
`.get`/`.patch`/`.delete`/`.put` registrations in `apps/worker/src/routes/{admin,auth,
billing,billing-webhook,editor,feedback,projects,share-links,shared,sources}.ts` and
the mount points in `apps/worker/src/index.ts`. All paths, methods, and auth tiers
match. No action needed; noting this so the audit record shows the API surface was
actually verified, not assumed clean.

### 10. Data model schema vs. `docs/data-model.md` — accurate except for the three tables in finding 2
Every field, type, enum, index, and FK in `apps/worker/src/lib/db/schema/*.ts` for the
14 tables `data-model.md` does document was checked against the doc's per-table
sections; they match closely, including deliberately-called-out deltas the doc itself
already tracks (e.g. `uploaded_files.title`, added during US-017 and noted inline as a
deviation from the original field list). This is a well-maintained doc apart from
finding 2's gap.

### 11. `docs/infra.md` vs. `wrangler.jsonc` and `.github/workflows/deploy.yml` — accurate
`wrangler.jsonc`'s single-Worker static-assets configuration (`run_worker_first:
["/api/*"]`, SPA fallback, `build.command`) matches `docs/infra.md`'s description
exactly, including the reasoning for `not_found_handling` and why the build step is
wired through `wrangler`'s own lifecycle rather than run separately.
`deploy.yml`'s actual step sequence (gate → `drizzle-kit migrate` → `supabase db push`
→ push-supabase-auth-config script → `wrangler deploy` → `put-worker-secrets` script)
matches `docs/infra.md`'s "Deploy pipeline" section step-for-step, including the
non-obvious rationale (`--db-url` instead of `supabase link`, why `supabase config
push` is deliberately avoided). No drift found; this is the strongest of the four
architecture docs.

### 12. Demo docs / spec correspondence — no missing files found
All 30 stories in `stories.json` are `status: "done"` and each has a `demo` field
pointing at a `docs/demos/US-0NN.md` file that exists on disk. For the 16 `browser`-kind
stories, `verification.specs` names an `e2e/us-0NN.spec.ts` file, and every one of those
16 files exists under `e2e/`. The 14 `command`-kind stories (US-001–US-010, US-024,
US-026–US-028, US-030) correctly have empty `verification.specs` — they're proven by
`e2e/demo-command.mjs`, which takes its commands inline from the invoking call rather
than from a fixed per-story script file, so there's no missing-spec-file class of bug
to find here. (Initially flagged `scripts/demo-us-001.sh`/`demo-us-003.sh` as possibly
missing since the `scripts/` directory has `demo-us-001-server.sh` but no
`demo-us-001.sh`/`demo-us-003.sh` — checked `docs/demos/US-001.md` and `US-003.md`
directly and confirmed those stories' steps are plain `npm`/`npx`/`psql` commands with
`demo-us-001-server.sh` used for exactly one step that needs a background server; no
missing script, false alarm.)

## Notes

- `docs/testing.md` accurately describes the three-tier strategy (Vitest unit →
  `@cloudflare/vitest-pool-workers` integration → Playwright demo specs) and the
  mocking boundary (`SOURCES_PROVIDER_MODE`/`AI_PROVIDER_MODE`, both env vars actually
  present and used per `apps/worker/src/index.ts`'s `Bindings` type). No drift found
  against current test file layout (`apps/worker/src/routes/*.test.ts`,
  `apps/worker/src/middleware/*.test.ts`, `e2e/*.spec.ts`).
- `docs/security.md`'s per-endpoint threat notes (AI-cost abuse, share-link brute
  force, malicious upload, cross-project leakage, prompt injection) all check out
  against the actual US-027/US-028 implementations (`lib/rate-limit`, `lib/net` retry/
  timeout wrapper, `lib/files/extract-text.ts`'s size/near-empty-extraction guards).
  Only the Authorization table (finding 1) and the secret table gap (finding 8) are
  inaccurate; the rest of the document is current.
- The README's "Production bootstrap" section (`npm run db:bootstrap-admin --
  you@example.com`) was verified against `db/bootstrap-admin.ts`, which exists and
  matches the described behavior (idempotent, sets `role='admin'`/`status='approved'`,
  updates `waitlist_signups`).
- `.env.example`'s header ("then run: `./scripts/sync-secrets.sh`") points at a real,
  working script — verified its content pushes `.env` values to GitHub repo secrets,
  allowlisted by `.env.example`'s own keys. This is a maintainer/CI-setup step, not
  part of local dev, so its absence from README's Development section is correct, not
  a gap.
- Didn't find any residual references to Cloudflare Pages, `_routes.json`, or Pages
  Functions anywhere in README or the four architecture docs — the single-Worker
  Workers-with-assets model is described consistently everywhere it's mentioned.
