# Alvus AI

Invite/waitlist-gated, subscription-based web app for AI-assisted academic paper
writing — source discovery and scoring, an auto-formatting citation-aware editor, and
post-writing feedback on wording, grammar, and content.

## Development
```bash
cp .env.example .env    # fill in values
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

## Tests and demos
```bash
npx playwright test
```
Specs generate the demo docs in `docs/demos/` — those are build artifacts, not
hand-written. Read them to see what the app does, story by story.

## Build pipeline
This repo builds itself one story at a time. The pipeline is built for web applications
and HTTP services; CLIs and libraries work too, with command-output demos in place of
browser flows. It cannot build mobile, native desktop, games, firmware, or ML training
projects, because it cannot generate an automatic per-story proof for them.
`stories.json` is the plan and the state; `docs/pipeline-log.md` is the history. See
`CLAUDE.md` for the rules the agents follow.
