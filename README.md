# Alvus AI

Invite/waitlist-gated, subscription-based web app for AI-assisted academic paper
writing — source discovery and scoring, an auto-formatting citation-aware editor, and
post-writing feedback on wording, grammar, and content.

## Documentation

- **Architecture & decisions**: `docs/tdd.md`
- **Data model**: `docs/data-model.md`
- **API surface**: `docs/api.md`
- **Security model**: `docs/security.md`
- **Testing strategy**: `docs/testing.md`
- **Infrastructure, environments, deploy pipeline, env vars, rollback/backups**: `docs/infra.md`

## Development
```bash
cp .env.example .env    # fill in values -- each var has a one-line purpose comment;
                         # see docs/infra.md's Environment variables tables for the
                         # CI/deploy-time vs. app-runtime split and sensitivity notes
supabase start           # local Docker Postgres, only if not using the shared dev project
```
Then run the `install` and `serve.dev` commands from `pipeline.json`;
`node .github/scripts/read-manifest.mjs --print` prints them. That file is how the
pipeline stays stack-agnostic — CI reads the same commands you do.

### Database

Schema is owned by Drizzle (`apps/worker/src/lib/db/schema/`); `drizzle.config.ts` at
the repo root points `drizzle-kit` at `DATABASE_URL`.

```bash
npm run db:generate   # diff the schema, write SQL to drizzle/migrations/ (dev-time, commit the output)
npm run db:migrate    # apply committed migrations to DATABASE_URL
```

Storage bucket config and RLS policies are Supabase-specific and live in
`supabase/migrations/*.sql`, applied automatically by `supabase start`/`supabase db
reset` locally, or `supabase db push` in CI/deploy.

### Production bootstrap

Admin approval (`POST /admin/waitlist/:userId/approve`) requires an existing admin, so
the very first admin account can't come from that flow. Instead:

1. Create the Supabase Auth account normally (sign up through the app, or create it
   directly in Supabase Studio) using the email you want as the first admin.
2. Promote it by running, with `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`
   pointed at that environment:
   ```bash
   npm run db:bootstrap-admin -- you@example.com
   ```

This is a one-time, non-public CLI script (`db/bootstrap-admin.ts`), never an HTTP
endpoint — it requires direct `DATABASE_URL` access, so it can't be triggered remotely
or by an unauthenticated request. It sets `role='admin'`, `status='approved'` on the
`users` row and creates/updates the matching `waitlist_signups` row, so the account
shows up correctly in the admin queue too. Safe to re-run; it's idempotent.

## Deploying

CI runs the deploy pipeline (`.github/workflows/deploy-preview.yml`,
`.github/workflows/deploy.yml`) — this is not a manual step:

- **Preview (per PR)**: every PR gets a Cloudflare Workers Version upload, posted back
  to the PR as an alias URL. It never receives production traffic and never touches a
  DB/Stripe/LiteLLM secret.
- **Production (on merge to `main`)**: install → typecheck → lint → build → test, then
  migrations (`drizzle-kit migrate`, `supabase db push`, the Supabase Auth config
  push) — halting on failure so the next step never runs against a bad schema — then
  `wrangler deploy`, then every app-runtime variable is (re-)bound as a Worker secret
  via `wrangler secret put` from the same repo secrets.

Full detail — environments matrix, why each step is ordered the way it is, the known
manual repairs — lives in `docs/infra.md`.

### Rollback

Full policy (additive-first migration strategy, backup priorities) lives in
`docs/infra.md`'s Rollback plan. The two concrete emergency procedures:

**Worker** — near-instant, the primary safety net for a bad code deploy:
```bash
npx wrangler deployments list        # find the last good Version ID
npx wrangler rollback [version-id]   # re-promote it to 100% of traffic
```

**Schema** — Drizzle only generates forward migrations, so undoing one is a manual,
break-glass step. Hand-written down-migrations live in `drizzle/rollback/`, named after
the forward migration they undo (e.g. `drizzle/rollback/0000_simple_blockbuster_down.sql`
undoes `drizzle/migrations/0000_simple_blockbuster.sql`), and are never applied by
`drizzle-kit migrate` — only new destructive forward migrations get a matching one. Apply
by hand against `DATABASE_URL`:
```bash
# psql's URI parser rejects the ?pgbouncer=true suffix Supabase's pooled
# connection string carries -- strip the query string before connecting.
psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f drizzle/rollback/<name>_down.sql
```
This drops tables and their data — default to additive/backward-compatible forward
migrations so this is rarely needed (see `docs/infra.md`).

### Backup / restore

Uploaded sources and drafts are sensitive, irreplaceable, single-owner data — there is
no user-facing "restore" flow. Recovery relies entirely on Supabase-managed Postgres
backups (free tier: daily, short retention — no point-in-time recovery). **This is an
operational runbook item to revisit before scaling past bootstrap budget**: upgrade to
a paid Supabase plan with PITR once real user data is at stake. Supabase Storage
(uploaded PDF/TXT files) has no PITR at any tier; mitigate with bucket versioning or a
periodic export job. Full detail in `docs/infra.md`'s Rollback plan → Backups.

## Tests and demos

CI's required check runs the same commands locally available via `pipeline.json`
(`npm run typecheck`, `npm run lint`, `npm run build`, and unit/integration tests via
`npm test`, against a live local Supabase Postgres started by `supabase start`):
```bash
npm test              # unit (Vitest) + Worker/API integration (@cloudflare/vitest-pool-workers)
npx playwright test   # story demo specs — a real wrangler dev, seeded fixture data
```
Playwright specs generate the demo docs in `docs/demos/` — those are build artifacts,
not hand-written. Read them to see what the app does, story by story. Full three-tier
strategy (unit → Worker/API integration → demo specs) in `docs/testing.md`.

## Build pipeline
This repo builds itself one story at a time. The pipeline is built for web applications
and HTTP services; CLIs and libraries work too, with command-output demos in place of
browser flows. It cannot build mobile, native desktop, games, firmware, or ML training
projects, because it cannot generate an automatic per-story proof for them.
`stories.json` is the plan and the state; `docs/pipeline-log.md` is the history. See
`CLAUDE.md` for the rules the agents follow.
