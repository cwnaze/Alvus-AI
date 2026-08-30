# Graph Report - Alvus-AI  (2026-08-30)

## Corpus Check
- 287 files · ~224,906 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1442 nodes · 2690 edges · 109 communities (82 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e4d4e9b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- API Surface doc
- shared.ts
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
- routes/billing.ts
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
- crossref.ts
- US-012 — password reset flow
- US-014 — create, list, rename, and delete a project
- US-015 — source discovery search
- US-013 — admin user directory
- push-supabase-auth-config.mjs
- sources.test.ts
- ProjectPage.tsx
- admin.ts
- DocumentContent
- citation/index.ts
- api.ts
- errors.ts
- AuthVariables
- AppError
- rls/package.json
- worker/src/index.ts
- US-016 — analyze a candidate source and select or reject it
- db/client.ts
- routes/sources.ts
- DashboardPage.tsx
- ai/client.ts
- rls/tsconfig.json
- WritingPage.tsx
- routes/feedback.ts
- feedback-anchors.ts
- editor.test.ts
- citations.ts
- schema/index.ts
- US-017 — upload your own PDF/TXT source
- US-018 — load, edit, and autosave a document in the editor
- US-019 — citation-format rendering: in-text citations, full-document re-render, dangling-citation detection
- US-021 — post-writing feedback pass
- US-020 — paragraph and structure suggestions in the editor
- US-022 — usage dashboard and limit-exceeded UX
- projects.test.ts
- US-026 — RLS integration test suite (deny-by-default across roles)
- feedback.test.ts
- request
- share-links.test.ts
- US-023 — Stripe Checkout and Billing Portal
- US-025 — read-only share link
- US-024 — Stripe webhook sync (subscription status, grace period, signature verification)
- billing.test.ts
- US-027 — Rate limiting on public and metered endpoints
- demo-us-024.sh
- demo-us-026.sh
- demo-us-027.sh
- feedbackHighlightExtension.ts
- admin.test.ts
- billing-webhook.test.ts
- US-028 — Timeout and retry/backoff policy for outbound calls
- rate-limit/index.test.ts
- demo-us-028.sh

## God Nodes (most connected - your core abstractions)
1. `request()` - 43 edges
2. `AppError` - 39 edges
3. `Db` - 21 edges
4. `AuthVariables` - 19 edges
5. `findAuthUserIdByEmail()` - 19 edges
6. `AuthBindings` - 18 edges
7. `test` - 18 edges
8. `createDb()` - 17 edges
9. `onError()` - 17 edges
10. `CORRELATION_ID_HEADER` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Commands` --references--> `FeedbackComment`  [EXTRACTED]
  apps/web/src/editor/feedbackHighlightExtension.ts → packages/shared/src/document.ts
- `Storage` --references--> `FeedbackComment`  [EXTRACTED]
  apps/web/src/editor/feedbackHighlightExtension.ts → packages/shared/src/document.ts
- `PR Review workflow` --references--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/pr-review.yml → .claude/skills/pr-review/SKILL.md
- `Production Prep workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `seedPaidTierSubscription()` --calls--> `getSubscriptionByUserId()`  [EXTRACTED]
  db/seed.ts → apps/worker/src/lib/db/queries/subscriptions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Workflows that dispatch a Claude Code skill via claude-code-action** — github_workflows_story_start, github_workflows_pr_review, github_workflows_pr_fix, github_workflows_production_prep [EXTRACTED 1.00]
- **Data model entities owned by projects (ON DELETE CASCADE from projects.id)** — docs_data_model_projects, docs_data_model_project_documents, docs_data_model_project_sources, docs_data_model_uploaded_files, docs_data_model_share_links, docs_data_model_feedback_passes [EXTRACTED 1.00]
- **implement-story / pr-review / pr-fix review-and-merge loop** — claude_skills_implement_story_skill, claude_skills_pr_review_skill, claude_skills_pr_fix_skill [INFERRED 0.85]

## Communities (109 total, 22 thin omitted)

### Community 0 - "API Surface doc"
Cohesion: 0.06
Nodes (49): CLAUDE.md project guide, LiteLLM proxy as sole AI access path (rationale: OpenAI-compatible proxy instead of direct Anthropic API/SDK, keeps model swappable via env config), Single Cloudflare Worker deploy target (rationale: fits bootstrap + minimal-budget goal, one deploy pipeline for frontend+API), Implement Story Skill, gh pr merge --auto --squash closes the loop (rationale: branch protection permits a merge but never performs one; without auto-merge armed, pr-review's approval satisfies the last check but nothing merges and the pipeline stalls silently), PR Fix Skill, PR Review Skill, review-verdict.json verdict handoff (rationale: the review agent is authenticated as PIPELINE_PAT, the same identity that opened the PR, and GitHub rejects self-approval, so a separate workflow step with a different token performs the actual gh pr review) (+41 more)

### Community 1 - "shared.ts"
Cohesion: 0.10
Nodes (32): createShareLink(), findShareLinkByTokenHash(), getActiveShareLinkByProject(), recordShareLinkAccess(), revokeShareLink(), ShareLinkRow, shareLinks, decryptShareToken() (+24 more)

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
Nodes (35): dependencies, @alvus-ai/shared, drizzle-orm, hono, openai, postgres, stripe, @supabase/supabase-js (+27 more)

### Community 15 - "devDependencies"
Cohesion: 0.04
Nodes (48): dotenv, drizzle-kit, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies (+40 more)

### Community 16 - "dependencies"
Cohesion: 0.05
Nodes (40): dependencies, @alvus-ai/shared, react, react-dom, react-router-dom, @tiptap/core, @tiptap/pm, @tiptap/react (+32 more)

### Community 17 - "findAuthUserIdByEmail"
Cohesion: 0.12
Nodes (11): db, main(), supabaseAdmin, findAuthUserIdByEmail(), Demo, Step, test, FIXTURES_DIR (+3 more)

### Community 18 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, jsx, lib, noEmit, types, extends, include, ES2022 (+6 more)

### Community 19 - "routes/billing.ts"
Cohesion: 0.06
Nodes (44): getSubscriptionByUserId(), SubscriptionRow, SubscriptionStatus, SubscriptionTier, updateSubscriptionByStripeSubscriptionId(), upsertSubscription(), getMonthlyLimit(), recordUsageEvent() (+36 more)

### Community 20 - "worker/tsconfig.json"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, noEmit, types, extends, include, @cloudflare/workers-types, ES2022 (+4 more)

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
Cohesion: 0.11
Nodes (23): AdminRoute(), App(), HomeRoute(), ProjectRoute(), AuthLayout(), ApiError, confirmPasswordReset(), login() (+15 more)

### Community 25 - "US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)"
Cohesion: 0.29
Nodes (6): 1. Typecheck every workspace, 2. Lint the whole repo, 3. Build the frontend for the Worker's static-assets binding, 4. Run the worker's test suite, 5. Boot wrangler dev and confirm the placeholder page and the API both respond, US-001 — Scaffold monorepo (frontend, Worker, shared package, tooling)

### Community 26 - "shared/src/index.ts"
Cohesion: 0.08
Nodes (45): ACTION_LABELS, TIER_LABELS, AdminUser, AdminUsersResponse, LoginResponse, RefreshResponse, Tier, TIERS (+37 more)

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

### Community 54 - "crossref.ts"
Cohesion: 0.07
Nodes (40): fetchWithRetry(), RetryFetchOptions, sleep(), FAST, TimeoutError, authorName(), CrossrefItem, CrossrefResponse (+32 more)

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

### Community 60 - "sources.test.ts"
Cohesion: 0.10
Nodes (22): EmptyExtractionError, extractPdf(), extractTextFromFile(), extractTxt(), UnparseableFileError, UploadMimeType, withTimeout(), SOURCE_UPLOADS_BUCKET (+14 more)

### Community 61 - "ProjectPage.tsx"
Cohesion: 0.10
Nodes (31): analyzeSource(), createShareLink(), deselectSource(), fetchBibliography(), fetchProject(), fetchShareLink(), rejectSource(), revokeShareLink() (+23 more)

### Community 62 - "admin.ts"
Cohesion: 0.12
Nodes (26): createDb(), listUsers(), revokeUserAccess(), approveWaitlistUser(), createPendingUser(), getUserById(), listWaitlistEntries(), rejectWaitlistUser() (+18 more)

### Community 63 - "DocumentContent"
Cohesion: 0.11
Nodes (14): Citation, CitationAttrs, Commands, @tiptap/core, DocumentEditor(), DocumentEditorProps, BIBLIOGRAPHY_HEADING, DocumentPreview() (+6 more)

### Community 64 - "citation/index.ts"
Cohesion: 0.16
Nodes (21): apaAuthor(), CitationFields, formatApa(), formatAuthorsApa(), formatAuthorsChicago(), formatAuthorsMla(), formatChicago(), formatCitation() (+13 more)

### Community 65 - "api.ts"
Cohesion: 0.21
Nodes (18): ApiErrorBody, apiLogout(), fetchMe(), refreshAccessToken(), AuthContext, AuthContextValue, AuthProvider(), revalidate() (+10 more)

### Community 66 - "errors.ts"
Cohesion: 0.18
Nodes (11): { execute }, CORRELATION_ID_HEADER, ErrorVariables, onError(), buildApp(), ErrorEnvelope, app, ENV (+3 more)

### Community 67 - "AuthVariables"
Cohesion: 0.16
Nodes (11): AuthBindings, AuthVariables, ENV, ErrorEnvelope, { getUser, getUserById }, app, {
  createUser,
  deleteUser,
  signOut,
  updateUserById,
  signInWithPassword,
  getUser,
  refreshSession,
  resetPasswordForEmail,
  verifyOtp,
  createPendingUser,
  getUserById,
  assertWithinAuthRateLimit,
  recordAuthRateLimitHit,
}, ENV (+3 more)

### Community 68 - "AppError"
Cohesion: 0.15
Nodes (16): createProject(), deleteProject(), getProjectById(), listProjects(), ProjectRow, renameProject(), AppError, parseContent() (+8 more)

### Community 69 - "rls/package.json"
Cohesion: 0.07
Nodes (27): dependencies, @alvus-ai/shared, drizzle-orm, hono, postgres, @supabase/supabase-js, devDependencies, @cloudflare/workers-types (+19 more)

### Community 70 - "worker/src/index.ts"
Cohesion: 0.18
Nodes (10): app, Bindings, admin, auth, editor, feedback, projects, shareLink (+2 more)

### Community 71 - "US-016 — analyze a candidate source and select or reject it"
Cohesion: 0.20
Nodes (9): 1. Searching returns candidate sources ready for AI analysis, 2. Triggering AI analysis shows the generated citation, summary, usefulness score, and key quotes, 3. A source lacking accessible full text is analyzed from its abstract and flagged as abstract-only, 4. Selecting an analyzed source adds it to the project bibliography, 5. Selecting a candidate adds it to the bibliography even without a prior analysis, 6. Rejecting a candidate, or having already selected one, keeps it from reappearing on a later search, 7. Deselecting a source removes it from the bibliography and returns it to the candidate pool, 8. Analysis is blocked with a clear limit-reached message once the tier quota is exhausted (+1 more)

### Community 72 - "db/client.ts"
Cohesion: 0.15
Nodes (20): Db, countAiRateLimitAttemptsSince(), recordAiRateLimitAttempt(), countAuthRateLimitAttemptsSince(), recordAuthRateLimitAttempt(), countShareLinkLookupsSince(), recordShareLinkLookup(), countSuggestionRequestsSince() (+12 more)

### Community 73 - "routes/sources.ts"
Cohesion: 0.10
Nodes (28): createUploadedProjectSource(), deleteProjectSource(), ExternalWorkIdentity, ExternalWorkRow, findExternalWorkByIdentity(), findOrCreateProjectSource(), getProjectSourceById(), listProjectSources() (+20 more)

### Community 74 - "DashboardPage.tsx"
Cohesion: 0.19
Nodes (13): createProject(), deleteProject(), fetchProjects(), renameProject(), CITATION_FORMAT_LABELS, DashboardPage(), handleLoadMore(), load() (+5 more)

### Community 75 - "ai/client.ts"
Cohesion: 0.11
Nodes (36): CATEGORY_SET, createLiteLLMClient(), normalizeAnalysis(), normalizeFeedback(), normalizeSuggestions(), requestFeedbackPass(), requestParagraphSuggestions(), requestSourceAnalysis() (+28 more)

### Community 76 - "rls/tsconfig.json"
Cohesion: 0.15
Nodes (12): node, *.ts, compilerOptions, lib, noEmit, types, extends, include (+4 more)

### Community 77 - "WritingPage.tsx"
Cohesion: 0.11
Nodes (20): fetchDocument(), fetchFeedbackPass(), fetchFeedbackPasses(), fetchSuggestions(), formatDocument(), requestFeedbackPass(), saveDocument(), CITATION_FORMAT_LABELS (+12 more)

### Community 78 - "routes/feedback.ts"
Cohesion: 0.10
Nodes (20): getOrCreateDocument(), ProjectDocumentRow, saveDocumentContent(), createFeedbackPass(), FeedbackPassRow, getFeedbackPassById(), listFeedbackPasses(), projectDocuments (+12 more)

### Community 79 - "feedback-anchors.ts"
Cohesion: 0.21
Nodes (11): BLOCK_TYPES, ExtractedText, extractPlainText(), markParagraphBreak(), pushText(), walk(), LEAF_ATOM_TYPES, locateQuote() (+3 more)

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
Cohesion: 0.27
Nodes (6): CitationLookup, isEmptyDocument(), rerenderCitations(), NodeLike, TiptapNode, walk()

### Community 82 - "schema/index.ts"
Cohesion: 0.14
Nodes (12): authSchema, authUsers, authRateLimitAttempts, externalWorks, FeedbackAnchorJson, FeedbackCommentJson, feedbackPasses, projects (+4 more)

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

### Community 89 - "projects.test.ts"
Cohesion: 0.25
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, { getUser, getUserById, createProject, listProjects, getProjectById, renameProject, deleteProject, listProjectSources }

### Community 90 - "US-026 — RLS integration test suite (deny-by-default across roles)"
Cohesion: 0.25
Nodes (7): 1. Confirm the local Supabase Postgres service is reachable, 2. Apply the RLS-enabling migration (drizzle/migrations -- idempotent), 3. Confirm every public table has row-level security enabled, 4. The lint/test step: fails the build the moment a table ships without RLS, 5. Non-owner denial: an authenticated non-owner cannot read or write another user's projects/sources/documents/feedback passes, and a pending/rejected user's own JWT is denied by RLS itself, 6. Share-link read path: resolves to exactly the linked project and nothing else, and still denies a third party via anon-key + RLS, US-026 — RLS integration test suite (deny-by-default across roles)

### Community 91 - "feedback.test.ts"
Cohesion: 0.20
Nodes (8): app, asCaller(), callerRow(), ENV, ErrorEnvelope, {
  getUser,
  getUserById,
  getProjectById,
  getOrCreateDocument,
  createFeedbackPass,
  listFeedbackPasses,
  getFeedbackPassById,
  requestFeedbackPass,
  assertWithinUsageLimit,
  recordUsage,
  assertWithinAiRateLimit,
  recordAiRateLimitHit,
}, post(), request()

### Community 92 - "request"
Cohesion: 0.13
Nodes (19): approveWaitlistEntry(), createCheckoutSession(), createPortalSession(), fetchAdminUsers(), fetchBillingStatus(), fetchSources(), fetchWaitlist(), rejectWaitlistEntry() (+11 more)

### Community 93 - "share-links.test.ts"
Cohesion: 0.22
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, {
  getUser,
  getUserById,
  getProjectById,
  getActiveShareLinkByProject,
  createShareLink,
  revokeShareLink,
  generateShareToken,
  hashShareToken,
  encryptShareToken,
  decryptShareToken,
}

### Community 94 - "US-023 — Stripe Checkout and Billing Portal"
Cohesion: 0.29
Nodes (6): 1. A free-tier account sees an upgrade option for each paid plan and no billing-portal link yet, 2. Upgrading redirects to a real Stripe test-mode Checkout session, 3. Completing Checkout with Stripe's test card returns to the app with the account upgraded to Plus, 4. Starting a duplicate Checkout for the plan already active on the account is rejected with a clear error, 5. An existing subscriber can open the real Stripe Billing Portal to manage or cancel their plan, US-023 — Stripe Checkout and Billing Portal

### Community 95 - "US-025 — read-only share link"
Cohesion: 0.25
Nodes (7): 1. The owner creates a project and selects a source into the bibliography, 2. The owner writes a short draft, which autosaves before navigating away, 3. The owner generates a read-only share link for the project, 4. A visitor with no account or login sees the shared paper read-only, with no editing controls, 5. The owner revokes the share link, 6. Revoking the link (or visiting an unknown token) shows a clear "no longer works" state instead of an error or the owner's data, US-025 — read-only share link

### Community 96 - "US-024 — Stripe webhook sync (subscription status, grace period, signature verification)"
Cohesion: 0.29
Nodes (6): 1. An invalid/missing Stripe-Signature is rejected and never reaches subscription-sync logic, 2. checkout.session.completed links the session's subscription/customer to the initiating user via client_reference_id, falling back to metadata.user_id, 3. customer.subscription.created/updated/deleted keep status, current_period_start/end, and cancel_at_period_end in sync, mapping the Stripe price id back to plus/pro, 4. invoice.payment_failed does not downgrade the user; the tier only drops to free once Stripe reports the subscription canceled or unpaid, 5. Full webhook + subscription-sync suite, for the record, US-024 — Stripe webhook sync (subscription status, grace period, signature verification)

### Community 97 - "billing.test.ts"
Cohesion: 0.25
Nodes (7): app, asCaller(), BillingStatusBody, callerRow(), ENV, ErrorEnvelope, { getUser, getUserById, checkUsageLimit, getSubscriptionByUserId, upsertSubscription, stripeCheckoutCreate, stripeCheckoutRetrieve, stripePortalCreate }

### Community 98 - "US-027 — Rate limiting on public and metered endpoints"
Cohesion: 0.33
Nodes (5): 1. Public auth endpoints (signup, login, password-reset request) are rate-limited per IP, checked before ever calling Supabase, with a 429 + Retry-After once exceeded, 2. Metered AI endpoints (analyze existing candidate, upload+analyze, feedback pass) are rate-limited per user in addition to the tier-quota check, with a 429 + Retry-After once exceeded, 3. The underlying rate-limit module: sliding window per IP/endpoint and per user/action type, always resolving silently under the ceiling and always throwing a 429 rate_limited AppError with Retry-After at it, 4. Full rate-limiting suite, for the record, US-027 — Rate limiting on public and metered endpoints

### Community 103 - "feedbackHighlightExtension.ts"
Cohesion: 0.32
Nodes (7): CATEGORY_CLASS, Commands, FeedbackHighlight, feedbackHighlightKey, Storage, @tiptap/core, FeedbackComment

### Community 104 - "admin.test.ts"
Cohesion: 0.29
Nodes (6): app, asCaller(), callerRow(), ENV, ErrorEnvelope, { getUser, getUserById, listWaitlistEntries, approveWaitlistUser, rejectWaitlistUser, listUsers, revokeUserAccess }

### Community 105 - "billing-webhook.test.ts"
Cohesion: 0.25
Nodes (6): BillingWebhookBindings, app, { confirmCheckoutSession, syncSubscriptionFromStripe }, ENV, ErrorEnvelope, signingClient

### Community 106 - "US-028 — Timeout and retry/backoff policy for outbound calls"
Cohesion: 0.25
Nodes (7): 1. The shared retry policy: an explicit per-attempt timeout that aborts a hung request, exponential-backoff retries on timeout/network error/5xx, a 4xx fails fast with no retry, and the retry budget is bounded rather than unbounded, 2. Semantic Scholar and CrossRef searches recover from a transient provider failure via the shared retry policy, and surface a provider error -- rather than hanging or retrying forever -- once the retry budget is exhausted, 3. Unpaywall OA resolution is best-effort: it retries a transient failure the same way, but still degrades to null (never throws, never fails the whole source search) once exhausted, 4. The LiteLLM proxy client is constructed with an explicit timeout and retry count instead of the SDK's 10-minute default, so a hung or transiently-failing proxy call doesn't hang the request either, 5. A source analysis or feedback pass records usage / persists its result exactly once, only after the (possibly retried) AI call resolves successfully -- never on a failure, and never twice, 6. Full suite for the record, US-028 — Timeout and retry/backoff policy for outbound calls

### Community 107 - "rate-limit/index.test.ts"
Cohesion: 0.50
Nodes (3): {
  countSuggestionRequestsSince,
  recordSuggestionRequest,
  countShareLinkLookupsSince,
  recordShareLinkLookup,
  countAuthRateLimitAttemptsSince,
  recordAuthRateLimitAttempt,
  countAiRateLimitAttemptsSince,
  recordAiRateLimitAttempt,
}, DB, NOW

## Knowledge Gaps
- **498 isolated node(s):** `db`, `story`, `issues`, `rounds`, `UNCOUNTED_WORKFLOWS` (+493 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 650 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `findAuthUserIdByEmail()` connect `findAuthUserIdByEmail` to `routes/billing.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `createDb()` connect `admin.ts` to `shared.ts`, `AppError`, `worker/src/index.ts`, `db/client.ts`, `routes/sources.ts`, `routes/feedback.ts`, `findAuthUserIdByEmail`, `routes/billing.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `AppError` connect `AppError` to `shared.ts`, `errors.ts`, `db/client.ts`, `routes/sources.ts`, `rate-limit/index.test.ts`, `routes/feedback.ts`, `routes/billing.ts`, `sources.test.ts`, `admin.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `db`, `story`, `issues` to the rest of the system?**
  _498 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Surface doc` be split into smaller, more focused modules?**
  _Cohesion score 0.061224489795918366 - nodes in this community are weakly interconnected._
- **Should `shared.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09725158562367865 - nodes in this community are weakly interconnected._
- **Should `watchdog.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12418300653594772 - nodes in this community are weakly interconnected._