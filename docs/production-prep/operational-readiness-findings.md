# Operational Readiness — Findings

Findings-only pass. Scope: structured logging/correlation IDs, health checks, graceful
shutdown/connection handling, migration rollback, env var documentation, backup/restore,
and external-service failure behavior. No code changes made.

## Must fix before launch

None found. The core operational primitives (health check, timeouts+retries on every
external call, clean error-envelope mapping for downstream failures, tested rollback
path) are all present and working. See Should fix / Notes for gaps worth closing before
they bite in production, but nothing here blocks launch on its own.

## Should fix soon

1. **Structured logging exists but is used in only 2 of 3 call sites, and one of those
   two doesn't include the correlation ID.**
   - `apps/worker/src/middleware/errors.ts:53-63` (`onError`'s catch-all) is the only
     place that emits a structured JSON log line, and it's also the only place that
     includes `correlationId`.
   - `apps/worker/src/index.ts:64` (`/api/health`'s DB-failure branch) logs a plain
     string via `console.error('/api/health DB round-trip failed:', err)` — no JSON
     structure, no correlation ID, even though `requestId` middleware runs before this
     handler and the ID is available via `c.get('requestId')`.
   - `apps/worker/src/routes/auth.ts:174` (`resetPasswordForEmail` failure) logs a plain
     string with no correlation ID and no structure at all.
   - Fix direction: add a small shared `log()` helper (JSON line, `correlationId` pulled
     from context) and route all three call sites through it, so a log line is always
     grep/query-able the same way regardless of which code path emitted it.

2. **`onError` never logs `AppError` instances — only truly unhandled `Error`s.**
   `apps/worker/src/middleware/errors.ts:38-51`: when a route throws `AppError` (every
   429 rate-limit rejection, 401/403 auth failure, 404, 422, 502 from a downstream
   provider, etc.), the handler returns the JSON envelope directly and never reaches the
   `console.error` below it. Only the generic-500 branch logs. That means there is
   currently zero server-side log line for: rate-limit trips (`lib/rate-limit`), failed
   logins, share-link brute-force attempts, or any of the `ai_provider_unreachable` /
   `sources_providers_unreachable` / `stripe_error` 502s routes throw when an external
   service is down. Those are exactly the events an operator would want to see trending
   in production (abuse patterns, degraded third-party dependencies), and right now
   they're invisible outside of whatever the client reports. Fix direction: log at least
   5xx-class `AppError`s (502/503) unconditionally, and consider a debug-level log for
   429/401 bursts if/when there's a log pipeline to receive it.

3. **Individual external-provider failures inside `lib/sources` are silently swallowed
   with no log line anywhere.**
   - `apps/worker/src/lib/sources/index.ts:30-42` (`searchSources`): uses
     `Promise.allSettled` across Semantic Scholar + CrossRef so one provider failing
     degrades gracefully to the other's results (this is correct behavior — see Notes)
     — but neither the individual rejection nor the merged "one of two failed" state is
     logged anywhere. Only the doubly-failed case (`providersUnreachable: true`) is
     visible, and even that isn't logged — it's just returned up to
     `apps/worker/src/routes/sources.ts:190` as a 502.
   - `apps/worker/src/lib/sources/unpaywall.ts:18-41` (`resolveOaStatus`): the `catch`
     block at line 38 returns `null` on any error, by design ("a failure here should
     never fail the whole search") — but nothing is logged, so a fully-degraded
     Unpaywall (every OA lookup failing) is invisible in production; the candidate list
     just quietly stops carrying OA status.
   - Fix direction: a `console.warn`/structured log at the point each provider call
     fails (with provider name + status/error) would make degraded-third-party trends
     visible without changing any of the graceful-degradation behavior.

4. **`/api/health`'s DB round-trip has no explicit query/connection timeout.**
   `apps/worker/src/index.ts:54-67` awaits `db.execute(sql\`select 1\`)` with no
   `timeoutMs`/`AbortSignal` wrapping it, unlike every other external call in this
   codebase (`lib/net/fetch-with-retry.ts` gives Semantic Scholar/CrossRef/Unpaywall an
   8s timeout, `lib/ai/client.ts` gives LiteLLM 20s). If Supabase's pooler accepts the
   TCP connection but then stalls (slow query, network partition mid-request), this
   handler — and therefore an uptime monitor hitting it — can hang for however long
   `postgres.js`'s own defaults allow, rather than failing fast with a 503. Fix
   direction: wrap the `db.execute` call in the same `fetchWithRetry`-style timeout
   pattern already used elsewhere, or pass `postgres()` an explicit
   `connect_timeout`/statement timeout in `lib/db/client.ts`.

5. **Documented Storage backup mitigation (bucket versioning / periodic export) is not
   implemented.** `docs/infra.md:136` and `README.md:108-109` both note "Storage lacks
   PITR — mitigate with bucket versioning or a periodic export job," but nothing in
   `supabase/migrations/`, `scripts/`, or `.github/` implements either. This is
   explicitly flagged in the docs as a pre-launch/bootstrap-stage accepted gap (see
   Accepted with rationale below), so it isn't a must-fix, but "documented as a plan"
   and "decided/actioned" are two different states — worth turning into an actual story
   before uploaded-PDF volume makes an export job painful to write under pressure.

## Accepted with rationale

- **No graceful-shutdown / connection-draining code, and none needed.** Cloudflare
  Workers isolates don't have a traditional process lifecycle — there's no listening
  socket to drain, no in-flight-request registry to wait on before exit. The codebase's
  one-connection-per-request DB pattern (`apps/worker/src/lib/db/client.ts:7-13`,
  explicitly commented: "Workers isolates don't share a process, so there's no pool to
  exhaust") and the deliberate choice not to close the health-check's DB connection
  (`apps/worker/src/index.ts:55-58`, commented: closing it races the Workers postgres.js
  polyfill's background stream read) are both correct, intentional adaptations to the
  runtime rather than gaps. No finding here.

- **Migration rollback: tested for the one migration that needed it, and the "why not
  the other 14" is a documented, self-consistent policy.** `drizzle/rollback/` contains
  exactly one hand-written down-migration
  (`0000_simple_blockbuster_down.sql`), and `docs/demos/US-009.md` shows it was actually
  run against a real `DATABASE_URL` (wrapped in `BEGIN`/`ROLLBACK`) as proof, not just
  written and left untested. Checked all 15 files in `drizzle/migrations/` for
  `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`: only `0000` contains one. Migrations
  `0011`/`0012`/`0013` contain `REVOKE` statements (privilege tightening, not data loss)
  and `0014` continues that pattern — none of them drop schema or data, which is exactly
  what `docs/infra.md`'s Rollback plan commits to ("default additive/backward-compatible
  … hand-write a down-migration for risky changes"). The README states the policy
  explicitly: "only new destructive forward migrations get a matching one." Given that,
  the absence of down-migrations for 14 non-destructive migrations is the policy working
  as designed, not an untested gap. Also worth noting: the Worker-rollback half of this
  story (`wrangler rollback`) was demonstrated end-to-end against a disposable scratch
  Worker in the same demo, not just documented.

- **Backup/restore for Postgres and Storage is documented and the free-tier limitation
  is an explicit, dated decision, not an oversight.** `README.md:102-110` and
  `docs/infra.md:125-137` both state plainly: no user-facing restore flow, Postgres
  backups rely on Supabase's free-tier daily/short-retention backups (no PITR), and
  upgrading to a paid PITR plan is explicitly called out as "an operational runbook item
  to revisit before scaling past bootstrap budget." Given the project's own stated
  bootstrap-budget constraint (see `docs/infra.md`'s environments section — no separate
  staging environment either, for the same reason), deferring the PITR upgrade while
  documenting it as a known, dated gap is a reasonable call. Only the "mitigate with
  bucket versioning" half is unactioned rather than just deferred (see Should-fix #5).

- **Env var documentation: `.env.example` and `docs/infra.md` are in lockstep (enforced
  by CI), and the few gaps found are pre-existing, harmless, and outside that check's
  scope.** `scripts/check-env-docs.mjs` cross-checks every `.env.example` key against
  `docs/infra.md` and currently passes 26/26. Cross-referencing actual code usage
  (`grep`ing every `process.env.X`/`c.env.X`/`env.X` across `apps/worker/src` and
  `apps/web/src`) against `.env.example` found two keys that are documented but never
  read anywhere in code: `SUPABASE_PUBLISHABLE_KEY` and `STRIPE_PUBLISHABLE_KEY`.
  Neither is a functional gap: the Worker's only Supabase client
  (`apps/worker/src/lib/supabase/client.ts`) uses the service-role
  (`SUPABASE_SECRET_KEY`) client for both user- and admin-facing operations, so there's
  no code path that needs the publishable key; and billing
  (`apps/worker/src/routes/billing.ts:89-108`) uses Stripe's hosted Checkout/Portal
  redirect flow (`session.url`), not Stripe Elements embedded in the frontend, so no
  client-side publishable key is needed either. Both are plausibly forward-looking
  (e.g. if a future story adds a second RLS-scoped Supabase client, or embeds Stripe
  Elements instead of redirecting), so leaving them documented is reasonable — just
  noting the mismatch since the task asked for it explicitly. No vars were found used in
  code but *missing* from `.env.example` — the reverse direction is clean.

## Notes

- **Health check exists and works correctly for its actual purpose.**
  `apps/worker/src/index.ts:54-67` (`GET /api/health`) does a real DB round-trip
  (`select 1`) and returns `{status: 'error', db: 'error'}` with a 503 on failure rather
  than a fake "ok." It only checks Postgres, not LiteLLM/Stripe/academic APIs/Storage —
  reasonable, since those already degrade gracefully per-request (see below) rather than
  taking the whole app down, so they don't belong in a liveness check the same way "is
  the system of record reachable" does.

- **Every external-service call site has an explicit timeout and bounded retries; none
  can hang the request indefinitely or surface a raw 500.**
  - `apps/worker/src/lib/net/fetch-with-retry.ts` gives Semantic Scholar, CrossRef, and
    Unpaywall an 8s default per-attempt timeout (4s for the higher-volume Unpaywall
    per-candidate lookup) with capped exponential-backoff retries, and only retries
    5xx/network/timeout failures — never a 4xx, which is correctly treated as
    non-retryable.
  - `apps/worker/src/lib/ai/client.ts:29-38` gives the LiteLLM proxy an explicit 20s
    timeout + 2 retries via the OpenAI SDK's own `timeout`/`maxRetries` options,
    deliberately overriding the SDK's 10-minute default so "a hung proxy shouldn't hang
    the request that's waiting on it" (the code comment's own words).
  - Every route that calls into `lib/ai` or `lib/sources` catches the resulting
    `AiProviderError`/`ProviderError`/`providersUnreachable` and maps it to a clean 502
    with a user-facing message (`apps/worker/src/routes/sources.ts:190,313-314,445-446`,
    `apps/worker/src/routes/feedback.ts:63-64`, `apps/worker/src/routes/editor.ts:138-
    139`) rather than letting it fall through to the generic 500 handler.
  - Stripe calls in `apps/worker/src/routes/billing.ts:90-102,125-132` are wrapped in
    try/catch mapping to a 502 `stripe_error`, and the webhook handler
    (`apps/worker/src/routes/billing-webhook.ts:27-40`) validates the signature before
    doing anything else and acknowledges (rather than errors on) unrecognized event
    types, so Stripe never gets into a retry storm against an endpoint that can't handle
    an event it doesn't recognize.
  - One dependency's failure mode is different in kind, not in quality: if Supabase
    Postgres itself is down, rate-limit checks (`lib/rate-limit`, which query the DB)
    throw and surface as a generic 500 via `onError`, rather than a friendly 503. Given
    Postgres is this app's system of record and `docs/infra.md` already documents "full
    outage → service unavailable state" for Supabase, this is consistent with the
    documented failure model rather than an inconsistency — flagging only as context,
    not a finding, since fixing it would mean adding a DB-specific pre-flight check
    that itself depends on the DB being reachable.

- **`AUTH_RATE_LIMIT_*` env vars didn't show up in the initial code-usage grep** because
  they're accessed via a keyed lookup (`env[AUTH_RATE_LIMIT_ENV_KEY[endpoint]]` in
  `apps/worker/src/routes/auth.ts:14-21`) rather than a literal `env.AUTH_RATE_LIMIT_…`
  reference. Confirmed by name search they are genuinely read and documented
  consistently in `.env.example` and `docs/infra.md` — no actual gap, just a reminder
  that a literal-reference grep alone isn't a complete cross-check for this codebase's
  style.
