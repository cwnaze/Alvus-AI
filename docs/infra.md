# Alvus AI — Infrastructure

## Environments

- **Local dev**: `wrangler dev` serves the built frontend + Hono API from one process
  (`http://localhost:8787`). DB via `supabase start` (local Docker Postgres) or a
  shared free-tier "dev" Supabase project for Storage/Auth behavior the local stack
  can't emulate. Secrets from local `.env`, never committed.
- **Preview (per-PR)**: Cloudflare Workers preview deploy per PR, live shareable URL,
  real Hono API against the shared non-production "dev" Supabase project (no per-PR
  database branching — revisit only if concurrent PRs start colliding on shared data).
- **Production**: `wrangler deploy` against the production Supabase project, live
  Stripe keys, production LiteLLM/academic-API credentials.
- No separate staging environment — per-PR previews cover that need at this scale.

## Deploy pipeline (GitHub Actions)

**On every PR**: install → typecheck → lint → build → test → `wrangler deploy`
(preview mode) → preview URL posted to the PR. Preview uses dev-scoped secrets only.

**On merge to `main`**:
1. install → typecheck → lint → build → test (same gate, re-run against `main`).
2. Migrations run before deploy, pipeline halts on failure:
   - `drizzle-kit generate` (dev-time, not CI) produces committed SQL in
     `/drizzle/migrations`.
   - CI applies them: `drizzle-kit migrate` against `DATABASE_URL`.
   - `supabase db push` (via `SUPABASE_ACCESS_TOKEN`) applies RLS policies/Storage
     bucket config/Auth settings from `supabase/migrations` — the Supabase-specific
     surface Drizzle doesn't own.
3. Only after migrations succeed: `wrangler deploy` to production.
4. Migration and deploy aren't atomic — default to additive/backward-compatible schema
   changes so a Worker rollback never lands on an incompatible schema.

## Environment variables

Two classes: CI/deploy-time (never shipped in the Worker) and app-runtime (bound via
`wrangler secret put`). `DATABASE_URL` is both.

### CI / deploy-time
| Variable | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Non-interactive `wrangler deploy`/`secret put` in CI. |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account/Worker. |
| `SUPABASE_ACCESS_TOKEN` | Non-interactive `supabase link`/`db push` in CI. |
| `SUPABASE_PROJECT_REF` | Which Supabase project CI targets (dev vs. prod). |
| `DATABASE_URL` | Runs `drizzle-kit migrate` before deploy; also used at runtime. |

### App runtime (Worker secrets)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase endpoint for supabase-js Auth/Storage calls. |
| `SUPABASE_PUBLISHABLE_KEY` | Client key (current Supabase key format, replaces the legacy anon key), used server-side in the Worker's `supabase-js` client; requests run under the user's RLS session. Not exposed to the frontend — the frontend never talks to Supabase directly, only through Worker routes, so this needs no `VITE_`/build-time-exposure prefix. |
| `SUPABASE_SECRET_KEY` | Privileged key (current Supabase key format, replaces the legacy service_role key) for RLS-bypassing server ops (e.g. admin waitlist approval). Highest-sensitivity secret — never exposed to the frontend. |
| `DATABASE_URL` | Drizzle ORM queries (usage-metering/billing) at runtime. |
| `LITELLM_API_KEY` | LiteLLM proxy — summarization, scoring, quotes, feedback. |
| `LITELLM_BASE_URL` | LiteLLM proxy base URL (OpenAI-compatible). |
| `LITELLM_MODEL` | Model alias requested through the LiteLLM proxy. |
| `STRIPE_SECRET_KEY` | Server-side Stripe calls. |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhook signatures. |
| `STRIPE_PUBLISHABLE_KEY` | Frontend-facing Stripe key (not secret, env-scoped). |
| `STRIPE_PRICE_ID_PLUS` / `STRIPE_PRICE_ID_PRO` | Stripe Price IDs for checkout-session creation. |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional — raises rate limit; app works without it. |
| `CROSSREF_CONTACT_EMAIL` | Polite-pool contact per CrossRef policy; not secret. |
| `UNPAYWALL_CONTACT_EMAIL` | Required query param per Unpaywall policy; not secret. |
| `PUBLIC_APP_URL` | Base URL for share links and Stripe redirect URLs. |

First-draft list — reconcile against data-model/API docs once settled (Stripe
price/product IDs as config, whether JWT verification needs anything beyond
`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`).

## External services

| Service | Used for | If down/rate-limited |
|---|---|---|
| Cloudflare Workers | Hosts frontend + API | Full outage, no fallback — monitor/alert, not redundancy |
| Supabase (Postgres/Auth/Storage) | System of record | Full outage → "service unavailable" state; backups protect data loss, not availability |
| Stripe | Checkout, billing, webhooks | New checkouts/tier-changes fail; keep existing users on their active tier with a grace period before webhook-driven downgrade |
| LiteLLM proxy | Core AI features | Feature-level error states; no fallback needed (no prose generation); retry/backoff + per-user throttling |
| Semantic Scholar | Primary source discovery | Empty/error state, let user upload their own sources (intake decision) |
| CrossRef | Supplementary discovery | Fall back to Semantic Scholar + manual upload |
| Unpaywall | OA full-text resolution | Falls back to abstract-only analysis (same path as closed-access sources) |

## Rollback plan

- **Worker**: `wrangler rollback [deployment-id]` — near-instant, primary safety net.
- **Schema**: Drizzle generates forward-only migrations. Default additive/backward-
  compatible so rollback is safe post-migration. Destructive changes ship in two
  deploys (stop reading/writing old column first, drop it later). Hand-write a
  down-migration for risky changes, applied manually as a break-glass step.
- **Backups**: uploaded source files (Storage) and in-progress drafts (Postgres) are
  irreplaceable — highest backup priority. Cached API metadata/summaries are
  regeneratable — lower priority. Rely on Supabase's Postgres backups (free tier =
  daily/short retention; budget for a paid plan with PITR once real users exist, given
  the sensitive/private data classification). Storage lacks PITR — mitigate with bucket
  versioning or a periodic export job.
