# Graph Report - Alvus-AI  (2026-08-08)

## Corpus Check
- 107 files · ~48,818 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 565 nodes · 740 edges · 54 communities (37 shown, 17 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e17a314f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PR Review Skill
- API Surface doc
- dispatch-next.mjs
- watchdog.mjs
- US-011 — waitlist signup, admin approval, and login
- validate-stories.mjs
- demo-command.mjs
- playwright
- read-manifest.mjs
- write-env.mjs
- complete-story.mjs
- playwright.config.ts
- sync-secrets.sh
- Notify workflow
- worker/package.json
- devDependencies
- devDependencies
- seed.ts
- compilerOptions
- scripts
- worker/tsconfig.json
- compilerOptions
- shared/package.json
- shared/tsconfig.json
- api.ts
- US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)
- admin.ts
- demo-us-001-server.sh
- US-002 — Provision Supabase (Postgres + Storage) and connect Drizzle to a migrated baseline schema
- demo-us-002.sh
- US-010 — Global error handler + structured logging with correlation ID
- US-003 — Seed the tier_limits catalog and dev/CI fixture users
- US-004 — Health check reports live database connectivity
- demo-us-004-server.sh
- demo-us-004.sh
- US-005 — CI test gate: typecheck/lint/build/test against a local Supabase Postgres service
- demo-us-005.sh
- US-006 — Secret scanning in CI
- demo-us-006.sh
- demo-us-006-plant-secret.sh
- US-007 — Deploy pipeline: migrate + wrangler deploy on merge, PR previews, secrets configured
- put-worker-secrets.mjs
- demo-us-007.sh
- US-008 — Bootstrap first admin account
- demo-us-008.sh
- US-009 — Verify rollback path (Worker + migration)
- demo-us-009-rollback-worker.sh
- demo-us-009.sh
- demo-us-010-server.sh
- demo-us-010.sh

## God Nodes (most connected - your core abstractions)
1. `scripts` - 12 edges
2. `compilerOptions` - 12 edges
3. `useAuth()` - 10 edges
4. `request()` - 10 edges
5. `createDb()` - 9 edges
6. `US-007 — Deploy pipeline: migrate + wrangler deploy on merge, PR previews, secrets configured` - 9 edges
7. `API Surface doc` - 9 edges
8. `Security Model doc` - 9 edges
9. `authenticate()` - 8 edges
10. `onError()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `PR Review workflow` --references--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/pr-review.yml → .claude/skills/pr-review/SKILL.md
- `Production Prep Skill` --references--> `Security Model doc`  [EXTRACTED]
  .claude/skills/production-prep/SKILL.md → docs/security.md
- `Production Prep workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `buildApp()` --indirect_call--> `onError()`  [INFERRED]
  apps/worker/src/middleware/errors.test.ts → apps/worker/src/middleware/errors.ts
- `Implement Story Skill` --references--> `Steering issue / authorAssociation trust rule (rationale: agents run with write+dispatch tokens, so untrusted text in issues/PR comments could be prompt injection; only OWNER/MEMBER/COLLABORATOR comments are binding)`  [EXTRACTED]
  .claude/skills/implement-story/SKILL.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **implement-story / pr-review / pr-fix review-and-merge loop** — claude_skills_implement_story_skill, claude_skills_pr_review_skill, claude_skills_pr_fix_skill [INFERRED 0.85]
- **Workflows that dispatch a Claude Code skill via claude-code-action** — github_workflows_story_start, github_workflows_pr_review, github_workflows_pr_fix, github_workflows_production_prep [EXTRACTED 1.00]
- **Data model entities owned by projects (ON DELETE CASCADE from projects.id)** — docs_data_model_projects, docs_data_model_project_documents, docs_data_model_project_sources, docs_data_model_uploaded_files, docs_data_model_share_links, docs_data_model_feedback_passes [EXTRACTED 1.00]

## Communities (54 total, 17 thin omitted)

### Community 0 - "PR Review Skill"
Cohesion: 0.12
Nodes (25): CLAUDE.md project guide, LiteLLM proxy as sole AI access path (rationale: OpenAI-compatible proxy instead of direct Anthropic API/SDK, keeps model swappable via env config), Single Cloudflare Worker deploy target (rationale: fits bootstrap + minimal-budget goal, one deploy pipeline for frontend+API), Implement Story Skill, gh pr merge --auto --squash closes the loop (rationale: branch protection permits a merge but never performs one; without auto-merge armed, pr-review's approval satisfies the last check but nothing merges and the pipeline stalls silently), PR Fix Skill, PR Review Skill, review-verdict.json verdict handoff (rationale: the review agent is authenticated as PIPELINE_PAT, the same identity that opened the PR, and GitHub rejects self-approval, so a separate workflow step with a different token performs the actual gh pr review) (+17 more)

### Community 1 - "API Surface doc"
Cohesion: 0.13
Nodes (24): API Surface doc, citation_format immutable after project creation (rationale: keeps in-text citation rendering and the bibliography consistent for the life of the paper), Metered actions: source analysis & feedback pass only (rationale: usage checked against tier_limits before the expensive work and incremented only on success, to prevent AI-cost abuse), Data Model doc, external_works table, feedback_passes table, project_documents table, project_sources table (+16 more)

### Community 2 - "dispatch-next.mjs"
Cohesion: 0.18
Nodes (12): active, db, dispatch(), done, eligible, existing, isPaused(), openPrep (+4 more)

### Community 3 - "watchdog.mjs"
Cohesion: 0.12
Nodes (18): active, allRuns, db, dead, emitters, failedSinceTouch, idleMinutes, lastTouch (+10 more)

### Community 4 - "US-011 — waitlist signup, admin approval, and login"
Cohesion: 0.22
Nodes (8): 1. A visitor submits the waitlist signup form and sees the pending-approval confirmation, 2. Logging in while pending shows a status screen instead of the app, 3. The admin reviews the pending waitlist queue, 4. The admin approves one entry and rejects the other; the queue empties, 5. The rejected fixture account sees a "not approved" status screen on login, 6. Once approved, the same user logs in and reaches the projects dashboard empty state, 7. Logging out clears the session; the same token is rejected with 401 on a protected route, US-011 — waitlist signup, admin approval, and login

### Community 5 - "validate-stories.mjs"
Cohesion: 0.29
Nodes (6): active, errors, ids, NON_TERMINAL, STATUSES, warnings

### Community 6 - "demo-command.mjs"
Cohesion: 0.40
Nodes (5): body, results, steps, [storyId, title, ...rest], trim()

### Community 7 - "playwright"
Cohesion: 0.40
Nodes (5): npx, playwright, tailwind, @playwright/mcp, tailwindcss-mcp-server

### Community 8 - "read-manifest.mjs"
Cohesion: 0.40
Nodes (3): DEFAULT_MARKER, out, RUNTIMES

### Community 9 - "write-env.mjs"
Cohesion: 0.40
Nodes (4): keys, lines, missing, secrets

### Community 10 - "complete-story.mjs"
Cohesion: 0.29
Nodes (4): db, issues, rounds, story

### Community 14 - "worker/package.json"
Cohesion: 0.07
Nodes (29): dependencies, @alvus-ai/shared, drizzle-orm, hono, postgres, @supabase/supabase-js, devDependencies, @cloudflare/vitest-pool-workers (+21 more)

### Community 15 - "devDependencies"
Cohesion: 0.07
Nodes (27): dotenv, drizzle-kit, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies (+19 more)

### Community 16 - "devDependencies"
Cohesion: 0.06
Nodes (32): dependencies, @alvus-ai/shared, react, react-dom, react-router-dom, devDependencies, tailwindcss, @tailwindcss/vite (+24 more)

### Community 17 - "seed.ts"
Cohesion: 0.10
Nodes (20): authSchema, authUsers, tierLimits, users, waitlistSignups, db, main(), supabaseAdmin (+12 more)

### Community 18 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, jsx, lib, noEmit, types, extends, include, ES2022 (+6 more)

### Community 19 - "scripts"
Cohesion: 0.10
Nodes (20): name, private, scripts, build, db:bootstrap-admin, db:generate, db:migrate, db:push (+12 more)

### Community 20 - "worker/tsconfig.json"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, noEmit, types, extends, include, ES2022, src (+4 more)

### Community 21 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule (+4 more)

### Community 22 - "shared/package.json"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, exports, typescript, name, private, scripts, typecheck (+3 more)

### Community 23 - "shared/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, noEmit, extends, include, ES2022, src, ../../tsconfig.base.json

### Community 24 - "api.ts"
Cohesion: 0.08
Nodes (40): AdminRoute(), App(), HomeRoute(), AuthLayout(), ApiError, ApiErrorBody, apiLogout(), approveWaitlistEntry() (+32 more)

### Community 25 - "US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)"
Cohesion: 0.29
Nodes (6): 1. Typecheck every workspace, 2. Lint the whole repo, 3. Build the frontend for the Worker's static-assets binding, 4. Run the worker's test suite, 5. Boot wrangler dev and confirm the placeholder page and the API both respond, US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)

### Community 26 - "admin.ts"
Cohesion: 0.07
Nodes (47): app, Bindings, { execute }, createDb(), Db, approveWaitlistUser(), createPendingUser(), getUserById() (+39 more)

### Community 31 - "US-002 — Provision Supabase (Postgres + Storage) and connect Drizzle to a migrated baseline schema"
Cohesion: 0.33
Nodes (5): 1. Boot the local Supabase stack (dev/CI parity), 2. Confirm the source-uploads Storage bucket is private (RLS-ready, no public read until owner-scoped policies land in US-014/US-017), 3. Apply the baseline schema via drizzle-kit, 4. Confirm users, waitlist_signups, and tier_limits exist, including the users -> auth.users FK, US-002 — Provision Supabase (Postgres + Storage) and connect Drizzle to a migrated baseline schema

### Community 34 - "US-010 — Global error handler + structured logging with correlation ID"
Cohesion: 0.40
Nodes (4): 1. Correlation ID + global error handler are wired for every request, not one route, 2. Unhandled errors return the standard envelope with a correlation ID (never a raw stack trace), propagate a caller-supplied ID, and log route/correlation ID/user ID, 3. A live request against a running Worker: a caller-supplied correlation ID is echoed back on the response, US-010 — Global error handler + structured logging with correlation ID

### Community 35 - "US-003 — Seed the tier_limits catalog and dev/CI fixture users"
Cohesion: 0.29
Nodes (6): 1. Boot the local Supabase stack (dev/CI parity) and apply the baseline schema, 2. Seed the tier_limits catalog and fixture users, 3. Re-run the seed to confirm it is idempotent (no duplicate-key errors, same row counts), 4. Confirm the v1 tier_limits catalog (free 5/3, plus 60/30, pro 250/120), 5. Confirm the three fixture users exist with correct status/role and a real backing auth.users row, US-003 — Seed the tier_limits catalog and dev/CI fixture users

### Community 39 - "US-005 — CI test gate: typecheck/lint/build/test against a local Supabase Postgres service"
Cohesion: 0.25
Nodes (7): 1. Confirm the local Supabase Postgres service (started in CI by setup-project's services step) is reachable, 2. ci.yml wires typecheck/lint/build/test into the required PR status check, with DATABASE_URL bound to that service, 3. Typecheck, 4. Lint, 5. Build, 6. Test, US-005 — CI test gate: typecheck/lint/build/test against a local Supabase Postgres service

### Community 41 - "US-006 — Secret scanning in CI"
Cohesion: 0.40
Nodes (4): 1. ci.yml's required check job runs gitleaks against every PR, 2. Scan this repo's real commit history — no leaks, 3. Plant a fake secret in a scratch repo and confirm gitleaks fails the build on a match, US-006 — Secret scanning in CI

### Community 44 - "US-007 — Deploy pipeline: migrate + wrangler deploy on merge, PR previews, secrets configured"
Cohesion: 0.20
Nodes (9): 1. Every PR gets a Cloudflare Workers preview: deploy-preview.yml uploads a per-PR Worker Version (never production traffic, never the Worker's bound secrets) using only the Cloudflare deploy-time credential, then posts the alias URL back to the PR, 2. Packaging a preview version succeeds end-to-end (dry run — this demo does not push a live Cloudflare deploy), 3. On merge to main, deploy.yml halts before wrangler deploy if migrations fail: migrate-then-deploy ordering, with no continue-on-error, 4. drizzle-kit migrate applies cleanly against the real deploy-time database (idempotent — a no-op once already applied), 5. supabase db push would apply cleanly against the same database (dry run — this demo does not mutate the live project), 6. CI secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, DATABASE_URL) are configured in the GitHub Actions secrets store, 7. wrangler.jsonc declares no plaintext vars block — app-runtime values only ever reach the Worker as secrets, 8. Every app-runtime variable (.env.example's 'App runtime' section) is bound to the Worker via wrangler secret put, sourced from the same repo secrets (+1 more)

### Community 45 - "put-worker-secrets.mjs"
Cohesion: 0.50
Nodes (3): env, exampleLines, runtimeKeys

### Community 47 - "US-008 — Bootstrap first admin account"
Cohesion: 0.29
Nodes (6): 1. Create a normal Supabase Auth account for the operator -- signing up never requires an admin to exist, 2. Confirm no users/waitlist_signups row exists yet for that account (this script creates them if missing), 3. Promote it to admin -- a CLI script run directly against DATABASE_URL, never an HTTP endpoint, 4. Confirm users.role=admin, users.status=approved, and waitlist_signups is now approved too, 5. Confirm re-running is idempotent (no duplicate-key errors, same result), US-008 — Bootstrap first admin account

### Community 49 - "US-009 — Verify rollback path (Worker + migration)"
Cohesion: 0.33
Nodes (5): 1. A deliberately-broken deploy is rolled back via wrangler rollback [deployment-id], and the command output demonstrates the previous version serving again (exercised against a disposable scratch Worker, never the real alvus-ai production Worker, so this proof can't cause a real outage), 2. A hand-written down-migration exists for the one applied migration (drizzle/migrations/0000_simple_blockbuster.sql), 3. The down-migration runs cleanly against the real DATABASE_URL (wrapped in BEGIN/ROLLBACK so this proof does not actually drop the tables), 4. Rollback procedure is documented in the README, US-009 — Verify rollback path (Worker + migration)

## Knowledge Gaps
- **256 isolated node(s):** `db`, `story`, `issues`, `rounds`, `UNCOUNTED_WORKFLOWS` (+251 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createDb()` connect `admin.ts` to `seed.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `AuthUser` connect `api.ts` to `admin.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `scripts`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `db`, `story`, `issues` to the rest of the system?**
  _256 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PR Review Skill` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `API Surface doc` be split into smaller, more focused modules?**
  _Cohesion score 0.12681159420289856 - nodes in this community are weakly interconnected._
- **Should `watchdog.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11578947368421053 - nodes in this community are weakly interconnected._