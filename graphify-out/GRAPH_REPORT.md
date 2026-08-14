# Graph Report - Alvus-AI  (2026-08-14)

## Corpus Check
- 238 files · ~188,576 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1183 nodes · 2196 edges · 99 communities (81 shown, 18 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c2cc8be3`
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
- dependencies
- devDependencies
- dependencies
- findAuthUserIdByEmail
- compilerOptions
- schema/index.ts
- worker/tsconfig.json
- compilerOptions
- shared/package.json
- shared/tsconfig.json
- App.tsx
- US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)
- shared/src/index.ts
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
- sources/index.ts
- US-012 — password reset flow
- US-014 — create, list, rename, and delete a project
- US-015 — source discovery search
- US-013 — admin user directory
- push-supabase-auth-config.mjs
- routes/sources.ts
- ProjectPage.tsx
- admin.ts
- DocumentEditor.tsx
- citation/index.ts
- AuthContext.tsx
- errors.ts
- AuthVariables
- routes/projects.ts
- sources.test.ts
- worker/src/index.ts
- US-016 — analyze a candidate source and select or reject it
- admin.test.ts
- ApiError
- DashboardPage.tsx
- ai/client.ts
- api.ts
- request
- editor.ts
- DocumentContent
- editor.test.ts
- citations.ts
- routes/feedback.ts
- US-017 — upload your own PDF/TXT source
- US-018 — load, edit, and autosave a document in the editor
- US-019 — citation-format rendering: in-text citations, full-document re-render, dangling-citation detection
- US-021 — post-writing feedback pass
- US-020 — paragraph and structure suggestions in the editor
- US-022 — usage dashboard and limit-exceeded UX
- extract-text.ts
- document.ts
- DocumentPreview.tsx
- UsagePage.tsx
- share-links.test.ts
- src/auth.ts
- US-025 — read-only share link
- storage/index.ts
- AdminUsersPage.tsx
- toSourceAnalysisResponse

## God Nodes (most connected - your core abstractions)
1. `request()` - 40 edges
2. `AuthVariables` - 19 edges
3. `AuthBindings` - 18 edges
4. `AppError` - 18 edges
5. `findAuthUserIdByEmail()` - 18 edges
6. `createDb()` - 16 edges
7. `test` - 16 edges
8. `onError()` - 15 edges
9. `Db` - 14 edges
10. `authenticate()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Commands` --references--> `FeedbackComment`  [EXTRACTED]
  apps/web/src/editor/feedbackHighlightExtension.ts → packages/shared/src/document.ts
- `Storage` --references--> `FeedbackComment`  [EXTRACTED]
  apps/web/src/editor/feedbackHighlightExtension.ts → packages/shared/src/document.ts
- `PR Review workflow` --references--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/pr-review.yml → .claude/skills/pr-review/SKILL.md
- `Production Prep workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `Production Prep Skill` --references--> `Security Model doc`  [EXTRACTED]
  .claude/skills/production-prep/SKILL.md → docs/security.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Workflows that dispatch a Claude Code skill via claude-code-action** — github_workflows_story_start, github_workflows_pr_review, github_workflows_pr_fix, github_workflows_production_prep [EXTRACTED 1.00]
- **Data model entities owned by projects (ON DELETE CASCADE from projects.id)** — docs_data_model_projects, docs_data_model_project_documents, docs_data_model_project_sources, docs_data_model_uploaded_files, docs_data_model_share_links, docs_data_model_feedback_passes [EXTRACTED 1.00]
- **implement-story / pr-review / pr-fix review-and-merge loop** — claude_skills_implement_story_skill, claude_skills_pr_review_skill, claude_skills_pr_fix_skill [INFERRED 0.85]

## Communities (99 total, 18 thin omitted)

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
Nodes (16): active, allRuns, db, dead, emitters, failedSinceTouch, findingsIssue, idleMinutes (+8 more)

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

### Community 14 - "dependencies"
Cohesion: 0.06
Nodes (33): dependencies, @alvus-ai/shared, drizzle-orm, hono, openai, postgres, @supabase/supabase-js, unpdf (+25 more)

### Community 15 - "devDependencies"
Cohesion: 0.04
Nodes (47): dotenv, drizzle-kit, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies (+39 more)

### Community 16 - "dependencies"
Cohesion: 0.05
Nodes (40): dependencies, @alvus-ai/shared, react, react-dom, react-router-dom, @tiptap/core, @tiptap/pm, @tiptap/react (+32 more)

### Community 17 - "findAuthUserIdByEmail"
Cohesion: 0.12
Nodes (11): db, main(), supabaseAdmin, findAuthUserIdByEmail(), Demo, Step, test, FIXTURES_DIR (+3 more)

### Community 18 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, jsx, lib, noEmit, types, extends, include, ES2022 (+6 more)

### Community 19 - "schema/index.ts"
Cohesion: 0.08
Nodes (34): getMonthlyLimit(), ActionType, recordUsageEvent(), sumUsage(), authSchema, authUsers, externalWorks, FeedbackAnchorJson (+26 more)

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
Cohesion: 0.17
Nodes (14): AdminRoute(), App(), HomeRoute(), ProjectRoute(), fetchBillingStatus(), fetchSharedPaper(), login(), useAuth() (+6 more)

### Community 25 - "US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)"
Cohesion: 0.29
Nodes (6): 1. Typecheck every workspace, 2. Lint the whole repo, 3. Build the frontend for the Worker's static-assets binding, 4. Run the worker's test suite, 5. Boot wrangler dev and confirm the placeholder page and the API both respond, US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)

### Community 26 - "shared/src/index.ts"
Cohesion: 0.15
Nodes (23): CITATION_FORMATS, CitationFormat, PROJECT_STATUSES, ProjectsResponse, ProjectStatus, SharedPaperResponse, SharedProject, ShareLinkResponse (+15 more)

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

### Community 54 - "sources/index.ts"
Cohesion: 0.11
Nodes (32): authorName(), CrossrefItem, CrossrefResponse, searchCrossref(), toRawCandidate(), crossrefFixture(), FixtureKind, fixtureKindForQuery() (+24 more)

### Community 55 - "US-012 — password reset flow"
Cohesion: 0.33
Nodes (5): 1. Requesting a password reset shows a generic confirmation screen, 2. An invalid reset token is rejected with a clear error, 3. A valid reset token lets the user set a new password, 4. Logging in with the new password reaches the app; the old password no longer works, US-012 — password reset flow

### Community 56 - "US-014 — create, list, rename, and delete a project"
Cohesion: 0.33
Nodes (5): 1. A newly-approved user sees the empty projects dashboard, 2. The user creates a project with a title and citation format (APA), 3. The user renames the project; the citation format stays APA, 4. Deleting requires confirmation; confirming removes the project and the empty state returns, US-014 — create, list, rename, and delete a project

### Community 57 - "US-015 — source discovery search"
Cohesion: 0.33
Nodes (5): 1. Opening a project shows its source-discovery view, 2. Searching returns candidate sources with title, authors, year, venue, and OA status, 3. An empty result set shows a clear empty state offering the manual-upload path, 4. An upstream provider outage shows a clear error state, US-015 — source discovery search

### Community 58 - "US-013 — admin user directory"
Cohesion: 0.40
Nodes (4): 1. The admin searches and filters the directory, and views the user's status, role, and tier, 2. Filtering by a paid tier returns nobody -- no account can be on a paid plan before billing ships, 3. The admin revokes the user's access; their status flips to rejected in the directory, US-013 — admin user directory

### Community 60 - "routes/sources.ts"
Cohesion: 0.10
Nodes (22): createUploadedProjectSource(), deleteProjectSource(), ExternalWorkIdentity, ExternalWorkRow, findExternalWorkByIdentity(), findOrCreateProjectSource(), getProjectSourceById(), ProjectSourceRow (+14 more)

### Community 61 - "ProjectPage.tsx"
Cohesion: 0.19
Nodes (16): analyzeSource(), createShareLink(), deselectSource(), fetchShareLink(), rejectSource(), revokeShareLink(), selectSource(), uploadSource() (+8 more)

### Community 62 - "admin.ts"
Cohesion: 0.14
Nodes (23): createDb(), Db, listUsers(), revokeUserAccess(), approveWaitlistUser(), createPendingUser(), getUserById(), listWaitlistEntries() (+15 more)

### Community 63 - "DocumentEditor.tsx"
Cohesion: 0.18
Nodes (10): DocumentEditor(), DocumentEditorProps, CATEGORY_CLASS, Commands, FeedbackHighlight, feedbackHighlightKey, Storage, @tiptap/core (+2 more)

### Community 64 - "citation/index.ts"
Cohesion: 0.16
Nodes (21): apaAuthor(), CitationFields, formatApa(), formatAuthorsApa(), formatAuthorsChicago(), formatAuthorsMla(), formatChicago(), formatCitation() (+13 more)

### Community 65 - "AuthContext.tsx"
Cohesion: 0.32
Nodes (11): apiLogout(), fetchMe(), AuthContext, AuthContextValue, AuthProvider(), clearSession(), getAccessToken(), getStoredUser() (+3 more)

### Community 66 - "errors.ts"
Cohesion: 0.10
Nodes (21): { execute }, { countSuggestionRequestsSince, recordSuggestionRequest }, DB, NOW, AppError, CORRELATION_ID_HEADER, ErrorVariables, onError() (+13 more)

### Community 67 - "AuthVariables"
Cohesion: 0.14
Nodes (13): AuthBindings, AuthVariables, ENV, ErrorEnvelope, { getUser, getUserById }, billing, Env, app (+5 more)

### Community 68 - "routes/projects.ts"
Cohesion: 0.13
Nodes (14): createProject(), deleteProject(), getProjectById(), listProjects(), ProjectRow, renameProject(), Env, loadOwnedProject() (+6 more)

### Community 69 - "sources.test.ts"
Cohesion: 0.15
Nodes (12): app, asCaller(), callerRow(), ENV, ErrorEnvelope, externalWorkRow(), {
  getUser,
  getUserById,
  getProjectById,
  upsertExternalWork,
  findOrCreateProjectSource,
  getProjectSourceById,
  listProjectSources,
  saveProjectSourceAnalysis,
  updateProjectSourceState,
  deleteProjectSource,
  createUploadedProjectSource,
  searchSources,
  requestSourceAnalysis,
  assertWithinUsageLimit,
  recordUsage,
  extractTextFromFile,
  uploadSourceFile,
}, projectSourceRow() (+4 more)

### Community 70 - "worker/src/index.ts"
Cohesion: 0.12
Nodes (18): app, Bindings, createShareLink(), findShareLinkByToken(), getActiveShareLinkByProject(), recordShareLinkAccess(), revokeShareLink(), ShareLinkRow (+10 more)

### Community 71 - "US-016 — analyze a candidate source and select or reject it"
Cohesion: 0.20
Nodes (9): 1. Searching returns candidate sources ready for AI analysis, 2. Triggering AI analysis shows the generated citation, summary, usefulness score, and key quotes, 3. A source lacking accessible full text is analyzed from its abstract and flagged as abstract-only, 4. Selecting an analyzed source adds it to the project bibliography, 5. Selecting a candidate adds it to the bibliography even without a prior analysis, 6. Rejecting a candidate, or having already selected one, keeps it from reappearing on a later search, 7. Deselecting a source removes it from the bibliography and returns it to the candidate pool, 8. Analysis is blocked with a clear limit-reached message once the tier quota is exhausted (+1 more)

### Community 72 - "admin.test.ts"
Cohesion: 0.29
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, { getUser, getUserById, listWaitlistEntries, approveWaitlistUser, rejectWaitlistUser, listUsers, revokeUserAccess }

### Community 73 - "ApiError"
Cohesion: 0.26
Nodes (8): AuthLayout(), ApiError, confirmPasswordReset(), requestPasswordReset(), signup(), ForgotPasswordPage(), ResetPasswordPage(), SignupPage()

### Community 74 - "DashboardPage.tsx"
Cohesion: 0.33
Nodes (8): createProject(), deleteProject(), fetchProjects(), renameProject(), CITATION_FORMAT_LABELS, DashboardPage(), NewProjectForm(), ProjectRow()

### Community 75 - "ai/client.ts"
Cohesion: 0.08
Nodes (42): CATEGORY_SET, normalizeAnalysis(), normalizeFeedback(), normalizeSuggestions(), requestFeedbackPass(), requestParagraphSuggestions(), requestSourceAnalysis(), { create } (+34 more)

### Community 76 - "api.ts"
Cohesion: 0.29
Nodes (10): ApiErrorBody, approveWaitlistEntry(), fetchSources(), fetchWaitlist(), refreshAccessToken(), rejectWaitlistEntry(), getRefreshToken(), setTokens() (+2 more)

### Community 77 - "request"
Cohesion: 0.17
Nodes (18): fetchBibliography(), fetchDocument(), fetchFeedbackPass(), fetchFeedbackPasses(), fetchProject(), fetchSuggestions(), formatDocument(), request() (+10 more)

### Community 78 - "editor.ts"
Cohesion: 0.17
Nodes (11): getOrCreateDocument(), ProjectDocumentRow, saveDocumentContent(), listProjectSources(), countSuggestionRequestsSince(), recordSuggestionRequest(), assertWithinSuggestionRateLimit(), recordSuggestionRequestHit() (+3 more)

### Community 79 - "DocumentContent"
Cohesion: 0.23
Nodes (9): BLOCK_TYPES, ExtractedText, extractPlainText(), LEAF_ATOM_TYPES, locateQuote(), mapOffset(), TextSegment, TiptapNode (+1 more)

### Community 80 - "editor.test.ts"
Cohesion: 0.22
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, {
  getUser,
  getUserById,
  getProjectById,
  getOrCreateDocument,
  saveDocumentContent,
  listProjectSources,
  countSuggestionRequestsSince,
  recordSuggestionRequest,
}

### Community 81 - "citations.ts"
Cohesion: 0.31
Nodes (6): CitationLookup, isEmptyDocument(), rerenderCitations(), NodeLike, TiptapNode, walk()

### Community 82 - "routes/feedback.ts"
Cohesion: 0.21
Nodes (9): createFeedbackPass(), FeedbackPassRow, getFeedbackPassById(), listFeedbackPasses(), FeedbackCommentJson, feedbackPasses, Env, feedback (+1 more)

### Community 83 - "US-017 — upload your own PDF/TXT source"
Cohesion: 0.25
Nodes (7): 1. Uploading a PDF is analyzed automatically and added straight to the bibliography, 2. A TXT upload with no title given falls back to the file name, 3. An unsupported file type is rejected with a clear error, 4. An oversized file is rejected with a clear error, 5. A corrupted PDF fails gracefully with a clear error instead of crashing, 6. A scanned-image-only PDF is flagged as having no extractable text, not silently analyzed empty, US-017 — upload your own PDF/TXT source

### Community 84 - "US-018 — load, edit, and autosave a document in the editor"
Cohesion: 0.29
Nodes (6): 1. Opening a project loads an empty document into the rich text editor, 2. Typing in the editor triggers an autosave with no explicit save action, 3. Formatting text as bold through the toolbar autosaves the change, 4. Navigating away right after an edit still flushes the pending autosave, 5. Reloading the page loads the autosaved document back into the editor, US-018 — load, edit, and autosave a document in the editor

### Community 85 - "US-019 — citation-format rendering: in-text citations, full-document re-render, dangling-citation detection"
Cohesion: 0.33
Nodes (5): 1. The writing view shows the bibliography sidebar alongside the editor, 2. Inserting a citation from the bibliography renders it correctly formatted for the project's APA style, 3. Triggering a full re-render assembles the complete formatted paper with headers, margins, and a bibliography page, 4. A re-render flags the in-text citation whose source is no longer in the bibliography as dangling, US-019 — citation-format rendering: in-text citations, full-document re-render, dangling-citation detection

### Community 86 - "US-021 — post-writing feedback pass"
Cohesion: 0.33
Nodes (5): 1. Requesting a feedback pass on an empty document returns a clear error, not an empty pass, 2. A feedback pass surfaces wording/grammar/content comments as margin annotations anchored to the draft, without changing the document, 3. Past feedback passes are listed in the project history and can be reopened, 4. Once the free tier's monthly feedback-pass limit is reached, requesting another pass is blocked with a clear limit-reached response, US-021 — post-writing feedback pass

### Community 87 - "US-020 — paragraph and structure suggestions in the editor"
Cohesion: 0.40
Nodes (4): 1. Requesting a suggestion while writing shows an inline hint near the editor, never inserted into the document, 2. Repeating the request well past the free tier's metered-action limit still succeeds -- suggestions are not metered, 3. A rapid burst of repeated requests is throttled with a clear 429 rate-limit response, not silently dropped, US-020 — paragraph and structure suggestions in the editor

### Community 88 - "US-022 — usage dashboard and limit-exceeded UX"
Cohesion: 0.50
Nodes (3): 1. The usage dashboard shows the account's plan tier and usage against each metered action's monthly limit, 2. Once a metered action's monthly limit is exhausted, the dashboard shows a clear upgrade-or-wait message instead of a generic error, US-022 — usage dashboard and limit-exceeded UX

### Community 89 - "extract-text.ts"
Cohesion: 0.28
Nodes (7): EmptyExtractionError, extractPdf(), extractTextFromFile(), extractTxt(), UnparseableFileError, UploadMimeType, withTimeout()

### Community 90 - "document.ts"
Cohesion: 0.18
Nodes (10): DanglingCitation, DocumentFormatResponse, FEEDBACK_CATEGORIES, FeedbackAnchor, FeedbackPassesResponse, FeedbackPassResponse, FeedbackPassSummary, ProjectDocumentResponse (+2 more)

### Community 91 - "DocumentPreview.tsx"
Cohesion: 0.22
Nodes (8): Citation, CitationAttrs, Commands, @tiptap/core, BIBLIOGRAPHY_HEADING, DocumentPreview(), DocumentPreviewProps, FORMAT_LABEL

### Community 92 - "UsagePage.tsx"
Cohesion: 0.24
Nodes (7): ACTION_LABELS, TIER_LABELS, Tier, BillingStatusResponse, METERED_ACTIONS, MeteredAction, UsageLimitSummary

### Community 93 - "share-links.test.ts"
Cohesion: 0.22
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, { getUser, getUserById, getProjectById, getActiveShareLinkByProject, createShareLink, revokeShareLink, generateShareToken }

### Community 94 - "src/auth.ts"
Cohesion: 0.22
Nodes (8): AdminUsersResponse, LoginResponse, RefreshResponse, TIERS, USER_ROLES, UserRole, WAITLIST_STATUSES, WaitlistEntriesResponse

### Community 95 - "US-025 — read-only share link"
Cohesion: 0.25
Nodes (7): 1. The owner creates a project and selects a source into the bibliography, 2. The owner writes a short draft, which autosaves before navigating away, 3. The owner generates a read-only share link for the project, 4. A visitor with no account or login sees the shared paper read-only, with no editing controls, 5. The owner revokes the share link, 6. Revoking the link (or visiting an unknown token) shows a clear "no longer works" state instead of an error or the owner's data, US-025 — read-only share link

### Community 96 - "storage/index.ts"
Cohesion: 0.53
Nodes (3): SOURCE_UPLOADS_BUCKET, StorageError, uploadSourceFile()

### Community 97 - "AdminUsersPage.tsx"
Cohesion: 0.60
Nodes (4): fetchAdminUsers(), revokeUserAccess(), AdminUsersPage(), AdminUser

### Community 98 - "toSourceAnalysisResponse"
Cohesion: 0.40
Nodes (5): titleForUploadedFile(), toKeyQuotes(), toNumber(), toProjectSource(), toSourceAnalysisResponse()

## Knowledge Gaps
- **417 isolated node(s):** `db`, `story`, `issues`, `rounds`, `UNCOUNTED_WORKFLOWS` (+412 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `findAuthUserIdByEmail()` connect `findAuthUserIdByEmail` to `schema/index.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `createDb()` connect `admin.ts` to `AuthVariables`, `routes/projects.ts`, `worker/src/index.ts`, `editor.ts`, `findAuthUserIdByEmail`, `routes/feedback.ts`, `schema/index.ts`, `routes/sources.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `db`, `story`, `issues` to the rest of the system?**
  _417 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PR Review Skill` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `API Surface doc` be split into smaller, more focused modules?**
  _Cohesion score 0.12681159420289856 - nodes in this community are weakly interconnected._
- **Should `watchdog.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12418300653594772 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._