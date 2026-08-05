# Alvus AI — Technical Design

## Architecture

Single Cloudflare Worker serves both the built React/Vite frontend (static-assets
binding) and a Hono API (`/api/*`, `/webhooks/*`) from one deploy target. Same origin —
no CORS. Backed by Supabase (Postgres via Drizzle direct connection; Auth and Storage
via `supabase-js`) and external APIs: Semantic Scholar, CrossRef, Unpaywall (source
discovery/full text), Anthropic Claude (AI analysis/feedback), Stripe (billing +
webhooks).

```
                    ┌───────────────────────────────────────────┐
                    │            Cloudflare Worker (single)        │
Browser ──HTTPS──▶  │  ┌───────────────┐   ┌──────────────────┐ │
(React SPA)         │  │ Static assets │   │   Hono API app   │ │
                    │  │ (Vite build)  │   │   /api/*         │ │
                    │  └───────────────┘   │   /webhooks/*    │ │
                    └──────────────────────┴────────┬─────────┘─┘
                                                       │
              ┌─────────────────────────────────────────┼───────────────────────┐
              ▼                                          ▼                       ▼
      ┌─────────────────┐                     ┌───────────────────┐   ┌──────────────┐
      │ Supabase          │                    │ Semantic Scholar   │   │ Stripe        │
      │ - Postgres        │                    │ CrossRef            │   │ Checkout/     │
      │   (Drizzle)        │                    │ Unpaywall            │   │ Billing/      │
      │ - Auth (JWT)       │                    │ Anthropic Claude     │   │ Webhooks      │
      │ - Storage (RLS)    │                    └───────────────────┘   └──────────────┘
      └─────────────────┘
```

## Component boundaries / directory layout

```
alvus-ai/
├── apps/
│   ├── web/                        # React + Vite frontend
│   │   ├── src/
│   │   │   ├── editor/             # TipTap v3: citation-aware extensions, bibliography
│   │   │   │                       # sync, live-format-on-type, feedback annotations
│   │   │   ├── pages/              # project creation, source discovery/review,
│   │   │   │                       # writing view, feedback view, billing/account
│   │   │   ├── components/
│   │   │   └── api/                # typed fetch client (uses packages/shared types)
│   │   └── vite.config.ts
│   │
│   └── worker/                     # single Cloudflare Worker: API + static asset host
│       ├── src/
│       │   ├── index.ts            # Hono app entry; mounts routes
│       │   ├── routes/
│       │   │   ├── auth.ts         # session bootstrap, waitlist signup
│       │   │   ├── projects.ts     # project CRUD (title, citation format)
│       │   │   ├── sources.ts      # discovery trigger, upload, select/confirm
│       │   │   ├── analysis.ts     # per-source AI analysis orchestration
│       │   │   ├── editor.ts       # document save/load, paragraph suggestions
│       │   │   ├── feedback.ts     # post-writing feedback pass
│       │   │   ├── billing.ts      # Stripe Checkout/portal session creation
│       │   │   └── webhooks.ts     # Stripe webhook receiver (signature-verified)
│       │   ├── lib/
│       │   │   ├── db/             # Drizzle schema + typed query functions (only
│       │   │   │                   # module that issues SQL)
│       │   │   ├── supabase/       # supabase-js, scoped to auth + storage only
│       │   │   ├── ai/             # Anthropic client, prompts, token-cost recording
│       │   │   ├── sources/        # Semantic Scholar/CrossRef/Unpaywall clients +
│       │   │   │                   # full-text fallback logic
│       │   │   ├── citation/       # MLA/APA/Chicago formatters (citation strings +
│       │   │   │                   # in-text citations)
│       │   │   ├── metering/       # action-based usage-limit checks + token-cost ledger
│       │   │   └── stripe/         # Stripe SDK client, webhook signature verification
│       │   └── middleware/         # Supabase JWT auth guard, usage-limit gate, errors
│       ├── wrangler.jsonc          # static-assets dir = apps/web/dist; Worker entry
│       └── vitest.config.ts        # @cloudflare/vitest-pool-workers
│
├── packages/
│   └── shared/                     # Drizzle-inferred row types, API request/response
│                                   # contracts, citation-format enum
├── package.json                    # npm workspaces root
└── drizzle.config.ts                # points drizzle-kit at DATABASE_URL
```

Rules: frontend never talks to Postgres/Supabase/Anthropic directly — only through
`apps/worker` routes. Only `lib/ai` calls Anthropic (consumed by `analysis.ts`,
`feedback.ts`, and `editor.ts` for suggestions — the latter is rate-limited but not
metered against tier limits). Only `lib/db` issues SQL. `lib/stripe` only creates
sessions/handles webhooks; it never decides whether an action is allowed —
`lib/metering` does, consulted before every metered AI call.

## Request flows

### Flow 1 — project creation → source discovery → per-source AI analysis → bibliography

1. `POST /api/projects` — title + citation format (MLA/APA/Chicago). `routes/projects.ts` → `lib/db`.
2. `POST /api/projects/:projectId/sources/search` — `routes/sources.ts` → `lib/sources` queries Semantic Scholar + CrossRef in parallel, merges/dedupes by DOI/title.
3. Full-text resolution — `lib/sources` calls Unpaywall per DOI; if open-access link exists, fetch + extract text; else flag `abstract-only` and use abstract/metadata already returned.
4. Empty/error state — no results or upstream API down/rate-limited → typed empty/error response; frontend offers manual upload (`POST /api/projects/:projectId/sources/upload` → Supabase Storage via `lib/supabase`, then same analysis step).
5. User selects candidate sources in UI (no AI call triggered yet — analysis is a separate, explicit action). Actively dismissing one (vs. leaving it unselected) is a distinct reject action, step 7a below.
6. `POST /api/projects/:projectId/sources/:sourceId/analyze` — `routes/analysis.ts`:
   a. `lib/metering` checks remaining "source analysis" actions for the user's tier; 402-style response if exhausted.
   b. `lib/ai` prompts Claude for citation fields, strengths/weaknesses, usefulness score, key quotes + usage suggestions; `lib/citation` renders the deterministic citation string from Claude-supplied fields.
   c. Token usage recorded to metering ledger alongside the action count.
   d. Result persisted via `lib/db`, returned to frontend.
7. On user confirmation ("add to project"), `routes/sources.ts` sets `state = 'selected'`. Bibliography is a derived view over `selected` sources, rendered by `lib/citation` — no separate authoring step.
   a. Dismissing a candidate is a soft `POST .../sources/:sourceId/reject` (→
      `state = 'rejected'`, not deleted, so it isn't re-surfaced on a later search).
      `DELETE .../sources/:sourceId` is reserved for removing a `selected` source (or
      an uploaded file) from the project entirely.

### Flow 2 — writing in the editor with live citation-format formatting

1. `GET /api/projects/:id/document` (`routes/editor.ts` → `lib/db`) loads TipTap JSON + confirmed source list into the editor.
2. In-text citations inserted from the confirmed-source list render client-side per the project's format, using the same rules as `lib/citation` (shared via `packages/shared` so in-text and bibliography formatting always match).
3. Paragraph/structure suggestions surface as inline UI hints (not inserted text) via a lighter `routes/editor.ts` / `lib/ai` call — rate-limited, not counted against tier usage limits.
4. `PUT /api/projects/:id/document` autosaves TipTap JSON via `lib/db`. No AI call needed for save — formatting is deterministic client-side, not regenerated per keystroke.
5. Full document (headers/margins/running heads/bibliography page) assembled client-side from TipTap doc + format ruleset.

### Flow 3 — post-writing comment-style feedback pass

1. `POST /api/projects/:projectId/document/feedback` — explicit, distinct metered action (not automatic).
2. `routes/feedback.ts` checks `lib/metering` for remaining feedback-pass actions.
3. `lib/ai` sends extracted document text to Claude with a commentary-only prompt (wording/phrasing/grammar/content) — never prose generation or rewriting.
4. Response parsed into `{ anchor span, comment, category }` items, persisted, returned.
5. Frontend renders items as TipTap comment-style annotations anchored to document ranges; nothing auto-applied to the document.
6. Token usage recorded to metering ledger, same as Flow 1 step 6c.
