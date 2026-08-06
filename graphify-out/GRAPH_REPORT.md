# Graph Report - Alvus-AI  (2026-08-06)

## Corpus Check
- 48 files · ~22,334 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 293 nodes · 302 edges · 31 communities (25 shown, 6 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b6e5a5c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PR Review Skill
- API Surface doc
- dispatch-next.mjs
- watchdog.mjs
- demo.ts
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
- web/package.json
- devDependencies
- compilerOptions
- package.json
- worker/tsconfig.json
- compilerOptions
- shared/package.json
- shared/tsconfig.json
- App.tsx
- US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)
- worker/src/index.ts
- demo-us-001-server.sh

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `API Surface doc` - 9 edges
3. `Security Model doc` - 9 edges
4. `PR Review Skill` - 8 edges
5. `projects table` - 8 edges
6. `CLAUDE.md project guide` - 7 edges
7. `scripts` - 6 edges
8. `US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)` - 6 edges
9. `Implement Story Skill` - 6 edges
10. `setup-project composite action` - 6 edges

## Surprising Connections (you probably didn't know these)
- `PR Review workflow` --references--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/pr-review.yml → .claude/skills/pr-review/SKILL.md
- `Production Prep Skill` --references--> `Security Model doc`  [EXTRACTED]
  .claude/skills/production-prep/SKILL.md → docs/security.md
- `Production Prep workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `App()` --references--> `CITATION_FORMATS`  [EXTRACTED]
  apps/web/src/App.tsx → packages/shared/src/citation.ts
- `Implement Story Skill` --references--> `Steering issue / authorAssociation trust rule (rationale: agents run with write+dispatch tokens, so untrusted text in issues/PR comments could be prompt injection; only OWNER/MEMBER/COLLABORATOR comments are binding)`  [EXTRACTED]
  .claude/skills/implement-story/SKILL.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **implement-story / pr-review / pr-fix review-and-merge loop** — claude_skills_implement_story_skill, claude_skills_pr_review_skill, claude_skills_pr_fix_skill [INFERRED 0.85]
- **Workflows that dispatch a Claude Code skill via claude-code-action** — github_workflows_story_start, github_workflows_pr_review, github_workflows_pr_fix, github_workflows_production_prep [EXTRACTED 1.00]
- **Data model entities owned by projects (ON DELETE CASCADE from projects.id)** — docs_data_model_projects, docs_data_model_project_documents, docs_data_model_project_sources, docs_data_model_uploaded_files, docs_data_model_share_links, docs_data_model_feedback_passes [EXTRACTED 1.00]

## Communities (31 total, 6 thin omitted)

### Community 0 - "PR Review Skill"
Cohesion: 0.12
Nodes (25): CLAUDE.md project guide, LiteLLM proxy as sole AI access path (rationale: OpenAI-compatible proxy instead of direct Anthropic API/SDK, keeps model swappable via env config), Single Cloudflare Worker deploy target (rationale: fits bootstrap + minimal-budget goal, one deploy pipeline for frontend+API), Implement Story Skill, gh pr merge --auto --squash closes the loop (rationale: branch protection permits a merge but never performs one; without auto-merge armed, pr-review's approval satisfies the last check but nothing merges and the pipeline stalls silently), PR Fix Skill, PR Review Skill, review-verdict.json verdict handoff (rationale: the review agent is authenticated as PIPELINE_PAT, the same identity that opened the PR, and GitHub rejects self-approval, so a separate workflow step with a different token performs the actual gh pr review) (+17 more)

### Community 1 - "API Surface doc"
Cohesion: 0.13
Nodes (24): API Surface doc, citation_format immutable after project creation (rationale: keeps in-text citation rendering and the bibliography consistent for the life of the paper), Metered actions: source analysis & feedback pass only (rationale: usage checked against tier_limits before the expensive work and incremented only on success, to prevent AI-cost abuse), Data Model doc, external_works table, feedback_passes table, project_documents table, project_sources table (+16 more)

### Community 2 - "dispatch-next.mjs"
Cohesion: 0.19
Nodes (11): active, db, dispatch(), done, eligible, existing, isPaused(), openPrep (+3 more)

### Community 3 - "watchdog.mjs"
Cohesion: 0.20
Nodes (10): active, db, idleMinutes, lastTouch, quotaBlocked(), rateLimitedUntil(), runs, sh() (+2 more)

### Community 4 - "demo.ts"
Cohesion: 0.29
Nodes (3): Demo, Step, test

### Community 5 - "validate-stories.mjs"
Cohesion: 0.29
Nodes (6): active, errors, ids, NON_TERMINAL, STATUSES, warnings

### Community 6 - "demo-command.mjs"
Cohesion: 0.33
Nodes (4): body, results, steps, [storyId, title, ...rest]

### Community 7 - "playwright"
Cohesion: 0.40
Nodes (5): npx, playwright, tailwind, @playwright/mcp, tailwindcss-mcp-server

### Community 8 - "read-manifest.mjs"
Cohesion: 0.40
Nodes (3): DEFAULT_MARKER, out, RUNTIMES

### Community 9 - "write-env.mjs"
Cohesion: 0.40
Nodes (4): keys, lines, missing, secrets

### Community 14 - "worker/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @alvus-ai/shared, hono, devDependencies, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, typescript, vitest (+15 more)

### Community 15 - "devDependencies"
Cohesion: 0.12
Nodes (17): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+9 more)

### Community 16 - "web/package.json"
Cohesion: 0.12
Nodes (15): dependencies, @alvus-ai/shared, react, react-dom, @alvus-ai/shared, name, private, scripts (+7 more)

### Community 17 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react (+7 more)

### Community 18 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, jsx, lib, noEmit, types, extends, include, ES2022 (+6 more)

### Community 19 - "package.json"
Cohesion: 0.13
Nodes (14): name, private, scripts, build, dev, lint, test, typecheck (+6 more)

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

### Community 24 - "App.tsx"
Cohesion: 0.43
Nodes (4): App(), rootEl, CITATION_FORMATS, CitationFormat

### Community 25 - "US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)"
Cohesion: 0.29
Nodes (6): 1. Typecheck every workspace, 2. Lint the whole repo, 3. Build the frontend for the Worker's static-assets binding, 4. Run the worker's test suite, 5. Boot wrangler dev and confirm the placeholder page and the API both respond, US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)

## Knowledge Gaps
- **144 isolated node(s):** `db`, `story`, `db`, `active`, `stuck` (+139 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Security Model doc` connect `API Surface doc` to `PR Review Skill`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `Production Prep Skill` connect `PR Review Skill` to `API Surface doc`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `API Surface doc` (e.g. with `project_sources table` and `projects table`) actually correct?**
  _`API Surface doc` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `Security Model doc` (e.g. with `API Surface doc` and `Infrastructure doc`) actually correct?**
  _`Security Model doc` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `db`, `story`, `db` to the rest of the system?**
  _144 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PR Review Skill` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._