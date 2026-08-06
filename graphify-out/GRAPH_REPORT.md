# Graph Report - .  (2026-08-05)

## Corpus Check
- Corpus is ~20,996 words - fits in a single context window. You may not need a graph.

## Summary
- 120 nodes · 138 edges · 14 communities (10 shown, 4 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.86)
- Token cost: 101,057 input · 0 output

## Community Hubs (Navigation)
- Pipeline Skills & Governance
- Alvus AI Data Model & API
- Story Dispatch Logic
- Pipeline Watchdog Logic
- Demo Harness (Browser)
- Stories Validation Logic
- Demo Harness (Command)
- MCP Server Config
- Manifest Reader Logic
- Env Materialization Logic
- Story Completion Logic
- Playwright Config
- Secrets Sync Script
- Notify Workflow

## God Nodes (most connected - your core abstractions)
1. `API Surface doc` - 9 edges
2. `Security Model doc` - 9 edges
3. `PR Review Skill` - 8 edges
4. `projects table` - 8 edges
5. `CLAUDE.md project guide` - 7 edges
6. `Implement Story Skill` - 6 edges
7. `setup-project composite action` - 6 edges
8. `users table` - 6 edges
9. `Production Prep Skill` - 5 edges
10. `Technical Design doc` - 5 edges

## Surprising Connections (you probably didn't know these)
- `PR Review workflow` --references--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/pr-review.yml → .claude/skills/pr-review/SKILL.md
- `Production Prep Skill` --references--> `Security Model doc`  [EXTRACTED]
  .claude/skills/production-prep/SKILL.md → docs/security.md
- `Production Prep workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `Implement Story Skill` --references--> `Steering issue / authorAssociation trust rule (rationale: agents run with write+dispatch tokens, so untrusted text in issues/PR comments could be prompt injection; only OWNER/MEMBER/COLLABORATOR comments are binding)`  [EXTRACTED]
  .claude/skills/implement-story/SKILL.md → CLAUDE.md
- `Implement Story Skill` --references--> `Pipeline Audit Log`  [EXTRACTED]
  .claude/skills/implement-story/SKILL.md → docs/pipeline-log.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **implement-story / pr-review / pr-fix review-and-merge loop** — claude_skills_implement_story_skill, claude_skills_pr_review_skill, claude_skills_pr_fix_skill [INFERRED 0.85]
- **Workflows that dispatch a Claude Code skill via claude-code-action** — github_workflows_story_start, github_workflows_pr_review, github_workflows_pr_fix, github_workflows_production_prep [EXTRACTED 1.00]
- **Data model entities owned by projects (ON DELETE CASCADE from projects.id)** — docs_data_model_projects, docs_data_model_project_documents, docs_data_model_project_sources, docs_data_model_uploaded_files, docs_data_model_share_links, docs_data_model_feedback_passes [EXTRACTED 1.00]

## Communities (14 total, 4 thin omitted)

### Community 0 - "Pipeline Skills & Governance"
Cohesion: 0.12
Nodes (25): CLAUDE.md project guide, LiteLLM proxy as sole AI access path (rationale: OpenAI-compatible proxy instead of direct Anthropic API/SDK, keeps model swappable via env config), Single Cloudflare Worker deploy target (rationale: fits bootstrap + minimal-budget goal, one deploy pipeline for frontend+API), Implement Story Skill, gh pr merge --auto --squash closes the loop (rationale: branch protection permits a merge but never performs one; without auto-merge armed, pr-review's approval satisfies the last check but nothing merges and the pipeline stalls silently), PR Fix Skill, PR Review Skill, review-verdict.json verdict handoff (rationale: the review agent is authenticated as PIPELINE_PAT, the same identity that opened the PR, and GitHub rejects self-approval, so a separate workflow step with a different token performs the actual gh pr review) (+17 more)

### Community 1 - "Alvus AI Data Model & API"
Cohesion: 0.13
Nodes (24): API Surface doc, citation_format immutable after project creation (rationale: keeps in-text citation rendering and the bibliography consistent for the life of the paper), Metered actions: source analysis & feedback pass only (rationale: usage checked against tier_limits before the expensive work and incremented only on success, to prevent AI-cost abuse), Data Model doc, external_works table, feedback_passes table, project_documents table, project_sources table (+16 more)

### Community 2 - "Story Dispatch Logic"
Cohesion: 0.19
Nodes (11): active, db, dispatch(), done, eligible, existing, isPaused(), openPrep (+3 more)

### Community 3 - "Pipeline Watchdog Logic"
Cohesion: 0.20
Nodes (10): active, db, idleMinutes, lastTouch, quotaBlocked(), rateLimitedUntil(), runs, sh() (+2 more)

### Community 4 - "Demo Harness (Browser)"
Cohesion: 0.29
Nodes (3): Demo, Step, test

### Community 5 - "Stories Validation Logic"
Cohesion: 0.29
Nodes (6): active, errors, ids, NON_TERMINAL, STATUSES, warnings

### Community 6 - "Demo Harness (Command)"
Cohesion: 0.33
Nodes (4): body, results, steps, [storyId, title, ...rest]

### Community 7 - "MCP Server Config"
Cohesion: 0.40
Nodes (5): npx, playwright, tailwind, @playwright/mcp, tailwindcss-mcp-server

### Community 8 - "Manifest Reader Logic"
Cohesion: 0.40
Nodes (3): DEFAULT_MARKER, out, RUNTIMES

### Community 9 - "Env Materialization Logic"
Cohesion: 0.40
Nodes (4): keys, lines, missing, secrets

## Knowledge Gaps
- **45 isolated node(s):** `db`, `story`, `db`, `active`, `stuck` (+40 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Security Model doc` connect `Alvus AI Data Model & API` to `Pipeline Skills & Governance`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `Production Prep Skill` connect `Pipeline Skills & Governance` to `Alvus AI Data Model & API`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `API Surface doc` (e.g. with `project_sources table` and `projects table`) actually correct?**
  _`API Surface doc` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `Security Model doc` (e.g. with `API Surface doc` and `Infrastructure doc`) actually correct?**
  _`Security Model doc` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `projects table` (e.g. with `API Surface doc` and `Testing Strategy doc`) actually correct?**
  _`projects table` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `db`, `story`, `db` to the rest of the system?**
  _45 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pipeline Skills & Governance` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._