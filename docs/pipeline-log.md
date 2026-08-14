# Pipeline audit log

Append-only. One line per state transition, written in the same commit as the
`stories.json` change it describes. This is the crash-recovery record: if a run dies,
the last line here plus the story's `status` field tell you exactly where to resume.

Format: `<iso8601> | <story-id> | <transition> | <detail>`

2026-08-04T00:00:00Z | - | bootstrap | Pipeline scaffold committed via repo-bootstrap.
2026-08-06T02:20:01Z | US-001 | in_progress | Branch feature/us-001-scaffold-monorepo created; starting monorepo scaffold.
2026-08-06T02:28:12Z | US-001 | in_review | PR #2 opened, auto-merge armed.
2026-08-06T02:49:00.004Z | US-001 | done | PR #2 merged after 0 review round(s)
2026-08-06T02:54:56.000Z | US-002 | in_progress | Branch feature/us-002-provision-supabase-postgres-storage-and-connect-drizzle created; starting Supabase/Drizzle provisioning.
2026-08-06T03:00:00.000Z | US-002 | pending | Crash resume: in_progress with no branch/PR found on remote; reset to pending for re-selection.
2026-08-06T03:01:00.000Z | US-002 | in_progress | Branch feature/us-002-provision-supabase-postgres-storage-and-connect-drizzle created; starting Supabase/Drizzle provisioning.
2026-08-06T04:33:01.000Z | US-002 | error_max_turns | story-start hit the 120-turn cap twice (runs 31066684516, 31070714273), no branch/PR either time -- the story bundled too many concerns.
2026-08-06T05:15:00.000Z | - | replan | stories.json regenerated 24 -> 30 stories via story-breakdown: split US-002 (old, 5AC/4 concerns) into new US-002/003/004, split US-003 (old CI pipeline) into new US-005/006/007, split US-014 (old editor) into new US-018/019, split US-018 (old Stripe) into new US-023/024. Coverage-sweep gaps (admin revoke, prod Worker secrets, backup/restore doc) folded into existing stories. US-001 preserved as done/merged; all other IDs and dependsOn remapped. story-breakdown's sizing heuristic fixed in daedalus first (split by concern, not AC count) so this doesn't recur.
2026-08-06T05:16:00.000Z | US-002 | in_progress | Branch feature/us-002-provision-supabase-drizzle-baseline-schema created; starting Supabase/Drizzle provisioning (narrower scope after replan: 2 AC, Supabase local stack + storage bucket, Drizzle baseline schema).
2026-08-06T06:00:00.000Z | US-002 | pending | Crash resume: in_progress with no branch/PR found on remote; reset to pending for re-selection.
2026-08-06T06:05:00.000Z | US-002 | in_progress | Branch feature/us-002-provision-supabase-drizzle-baseline-schema created; starting Supabase/Drizzle provisioning.
2026-08-06T11:36:58.053Z | US-002 | done | PR #3 merged after 0 review round(s)
2026-08-06T11:40:00.000Z | US-003 | in_progress | Branch feature/us-003-seed-tier-limits-and-fixture-users created; starting tier_limits catalog + fixture-user seed.
2026-08-06T11:50:00.000Z | US-003 | in_review | PR #4 opened, auto-merge armed.
2026-08-06T12:10:17.934Z | US-003 | done | PR #4 merged after 0 review round(s)
2026-08-06T12:15:00.000Z | US-004 | in_progress | Branch feature/us-004-health-check-reports-live-database-connectivity created; starting DB-connectivity health check.
2026-08-06T13:19:45.000Z | US-004 | pending | Crash resume: in_progress with no branch/PR found on remote; reset to pending for re-selection.
2026-08-06T13:21:00.000Z | US-004 | in_progress | Branch feature/us-004-health-check-reports-live-database-connectivity created; starting DB-connectivity health check.
2026-08-06T13:42:00.000Z | US-004 | in_review | PR #6 opened, auto-merge armed.
2026-08-06T13:55:00.000Z | US-004 | in_review | Round 1 review: PR #6 verified (typecheck/lint/build/test pass, US-004 demo proves a live DB round-trip, US-001-003 regression demos unchanged). One non-blocking finding (health-check catch swallows the DB error with no server-side log) filed as issue #7, changes-requested.
2026-08-06T14:00:00.000Z | US-004 | fixing | Working issue #7 (round 1): log the swallowed DB error in /api/health before returning 503.
2026-08-06T14:10:00.000Z | US-004 | in_review | Fix pushed for issue #7 (console.error before the 503, test asserts the log call); typecheck/lint/build/test pass, US-004 demo unchanged, US-001-003 regression demos re-verified. Back in review.
2026-08-06T14:20:00.000Z | US-004 | in_review | Round 2 review: PR #6 re-verified (typecheck/lint/build/test pass, US-004 demo regenerates identically, US-001 regression demo unchanged apart from timing). Round-1 finding (issue #7) confirmed fixed: catch block now logs the DB error before returning 503, with a unit test asserting the log call; confirmed the logged error does not leak DATABASE_URL credentials. No new findings. Verdict: approve.
2026-08-06T15:10:57.546Z | US-004 | done | PR #6 merged after 2 review round(s)
2026-08-06T15:20:00.000Z | US-005 | in_progress | Branch feature/us-005-ci-test-gate-typecheck-lint-build-test-against-a-local-supabase-postgres-service created; wiring npm test into ci.yml against the local Supabase Postgres service already started by setup-project.
2026-08-06T15:37:15.658Z | US-005 | done | PR #8 merged after 1 review round(s)
2026-08-06T15:45:58.000Z | US-006 | in_progress | Branch feature/us-006-secret-scanning-in-ci created; adding gitleaks secret scanning to ci.yml.
2026-08-06T23:31:07.102Z | US-006 | done | PR #10 merged after 0 review round(s)
2026-08-06T23:40:00.000Z | US-007 | in_progress | Branch feature/us-007-deploy-pipeline-migrate-wrangler-deploy-on-merge-pr-previews-secrets-configured created; wiring deploy-on-merge (migrate + wrangler deploy + worker secrets) and per-PR preview deploy workflows.
2026-08-07T00:12:23.810Z | US-007 | done | PR #11 merged after 1 review round(s)
2026-08-07T04:34:54Z | US-008 | in_progress | Branch feature/us-008-bootstrap-first-admin-account created; starting bootstrap-admin CLI script.
2026-08-07T12:13:15.000Z | US-008 | in_progress | Reconciliation: the in_progress marker from 04:34:54 never reached main (push gap), so dispatch-next re-selected US-008 as pending and re-dispatched; implement-story found the branch/PR already existed and wrote this marker to catch main up rather than redoing the work.
2026-08-08T01:42:33.301Z | US-008 | done | PR #13 merged after 1 review round(s)
2026-08-08T04:47:25.000Z | US-009 | in_progress | Branch feature/us-009-verify-rollback-path-worker-migration created; exercising wrangler rollback against a scratch Worker and hand-writing a down-migration for the emergency schema rollback path.
2026-08-08T05:08:01.188Z | US-009 | done | PR #18 merged after 1 review round(s)
2026-08-08T05:20:00.000Z | US-010 | in_progress | Branch feature/us-010-global-error-handler-structured-logging-with-correlation-id created; adding a global Hono error handler + correlation ID (hono/request-id) + structured error logging.
2026-08-08T17:33:02.991Z | US-010 | done | PR #20 merged after 2 review round(s)
2026-08-08T17:44:07.000Z | US-011 | in_progress | Branch feature/us-011-waitlist-signup-admin-approval-and-login created; building waitlist signup, admin approval, and login (Supabase Auth JWT middleware, /api/auth + /api/admin routes, React auth pages).
2026-08-08T20:28:14.000Z | US-011 | in_progress | Reconciliation: the 17:44:07 marker's story-start run (31269704328) failed before the branch or PR existed on remote; no work was lost, so this run creates the branch now and resumes rather than re-selecting.
2026-08-08T20:32:05.000Z | US-011 | pending | Crash resume: the 20:28:14 reconciliation marker's own story-start run also died before creating the branch or PR on remote (docs/pipeline-log.md-only commit b45fa5d); no work exists to resume, so reset to pending for clean re-selection.
2026-08-08T20:35:00.000Z | US-011 | in_progress | Branch feature/us-011-waitlist-signup-admin-approval-and-login created; building waitlist signup, admin approval, and login (Supabase Auth JWT middleware, /api/auth + /api/admin routes, React auth/admin pages).
2026-08-08T21:50:00.000Z | US-011 | pending | Crash resume: the 20:35:00 in_progress marker's story-start run also died before creating the branch or PR on remote (no local/remote branch found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-08T21:55:00.000Z | US-011 | in_progress | Branch feature/us-011-waitlist-signup-admin-approval-and-login created; building waitlist signup, admin approval, and login (Supabase Auth JWT middleware, /api/auth + /api/admin routes, React auth/admin pages, waitlist status screen).
2026-08-09T00:18:18.585Z | US-011 | done | PR #24 merged after 2 review round(s)
2026-08-09T00:26:22.000Z | US-012 | in_progress | Branch feature/us-012-password-reset-flow created; building password reset request/confirm endpoints (Supabase resetPasswordForEmail + verifyOtp recovery token) and frontend forgot/reset password pages.
2026-08-09T01:27:23.008Z | US-012 | done | PR #26 merged after 2 review round(s)
2026-08-09T01:35:00.000Z | US-013 | in_progress | Branch feature/us-013-admin-user-directory created; building admin user directory (search/filter by status+tier, view basic info, revoke an approved user's access).
2026-08-09T02:05:00.000Z | US-013 | pending | Crash resume: the 01:35:00 in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-09T02:07:00.000Z | US-013 | in_progress | Branch feature/us-013-admin-user-directory created; building admin user directory (search/filter by status+tier, view basic info, revoke an approved user's access).
2026-08-09T02:40:00.000Z | US-013 | pending | Crash resume: the 02:07:00 in_progress marker's story-start run also died before creating the branch or PR on remote (no local/remote branch found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-09T02:45:00.000Z | US-013 | in_progress | Branch feature/us-013-admin-user-directory created; building admin user directory (search/filter by status+tier, view basic info, revoke an approved user's access).
2026-08-09T16:01:21.993Z | US-013 | done | PR #28 merged after 2 review round(s)
2026-08-09T16:15:00.000Z | US-014 | in_progress | Branch feature/us-014-create-list-rename-and-delete-a-project created; building projects CRUD (create with title+citation format, list dashboard, rename, delete with confirmation, owner-only access).
2026-08-09T16:53:00.314Z | US-014 | done | PR #30 merged after 2 review round(s)
2026-08-09T17:00:00.000Z | US-015 | in_progress | Branch feature/us-015-source-discovery-search created; building source discovery search (Semantic Scholar + CrossRef search with Unpaywall OA resolution, external_works/project_sources schema, candidate results list with empty/error states, owner-only access).
2026-08-09T17:31:38.793Z | US-015 | done | PR #32 merged after 1 review round(s)
2026-08-09T17:38:25.000Z | US-016 | in_progress | Branch feature/us-016-analyze-a-candidate-source-and-select-or-reject-it created; building AI source analysis (LiteLLM-backed citation/strengths-weaknesses/usefulness-score/key-quotes), select/deselect/reject state transitions, abstract-only flagging, bibliography view, and source-analysis tier metering.
2026-08-10T22:57:12.758Z | US-016 | done | PR #34 merged after 1 review round(s)
2026-08-10T23:01:10.000Z | US-017 | in_progress | Branch feature/us-017-upload-your-own-pdf-txt-source created; building PDF/TXT upload (type/size validation, text extraction, corrupt-file and scanned-image-only-PDF handling, reuse of US-016 analysis pipeline to populate bibliography).
2026-08-10T23:45:07.677Z | US-017 | done | PR #40 merged after 1 review round(s)
2026-08-10T23:50:27.000Z | US-018 | in_progress | Branch feature/us-018-editor-load-edit-and-autosave-a-document-in-tiptap created; building the TipTap v3 rich text editor (project_documents schema, GET/PUT /projects/:projectId/document with optimistic-concurrency autosave) and the writing page that loads a project's document and autosaves edits.
2026-08-11T09:26:17.559Z | US-018 | done | PR #42 merged after 3 review round(s)
2026-08-11T09:30:29.000Z | US-019 | in_progress | Branch feature/us-019-citation-format-rendering created; building in-text citation insertion from the bibliography, full-document re-render (headers/margins/bibliography page per citation style), and dangling-citation detection.
2026-08-11T11:50:03.000Z | US-019 | pending | Crash resume: the 2026-08-11T09:30:29.000Z in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch, no PR found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-11T11:50:17.000Z | US-019 | in_progress | Branch feature/us-019-citation-format-rendering created; building in-text citation insertion from the bibliography, full-document re-render (headers/margins/bibliography page per citation style), and dangling-citation detection.
2026-08-11T18:00:00.000Z | US-019 | pending | Crash resume: the 2026-08-11T11:50:17.000Z in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch, no PR found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-11T18:00:30.000Z | US-019 | in_progress | Branch feature/us-019-citation-format-rendering created; building in-text citation insertion from the bibliography, full-document re-render (headers/margins/bibliography page per citation style), and dangling-citation detection.
2026-08-13T00:10:21.506Z | US-019 | done | PR #44 merged after 3 review round(s)
2026-08-13T00:15:00.000Z | US-020 | in_progress | Branch feature/us-020-paragraph-and-structure-suggestions-in-the-editor created; building the rate-limited (not metered) paragraph/structure suggestion endpoint on routes/editor.ts and inline hint UI in the writing view.
2026-08-13T00:51:47.558Z | US-020 | done | PR #48 merged after 1 review round(s)
2026-08-13T00:55:39.000Z | US-021 | in_progress | Branch feature/us-021-post-writing-feedback-pass created; building the post-writing feedback pass (LiteLLM-backed wording/phrasing/grammar/content comments anchored to document spans, rendered as margin-style annotations), feedback-pass history with reopen, empty-document rejection, and feedback-pass tier metering.
2026-08-13T04:14:12.000Z | US-021 | pending | Crash resume: the 2026-08-13T00:55:39.000Z in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch, no PR found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-13T04:15:00.000Z | US-021 | in_progress | Branch feature/us-021-post-writing-feedback-pass created; building the post-writing feedback pass (LiteLLM-backed wording/phrasing/grammar/content comments anchored to document spans, rendered as margin-style annotations), feedback-pass history with reopen, empty-document rejection, and feedback-pass tier metering.
2026-08-13T04:59:00.683Z | US-021 | done | PR #50 merged after 1 review round(s)
2026-08-13T14:03:21.716Z | US-022 | in_progress | Branch feature/us-022-usage-dashboard-and-limit-exceeded-ux created; building the usage dashboard (current usage vs. plan tier for source analyses/feedback passes, billing-period reset date) and confirming the existing limit-exceeded UX gives a clear upgrade-or-wait message.
2026-08-13T17:50:23.020Z | US-022 | done | PR #52 merged after 1 review round(s)
2026-08-13T21:46:18.000Z | US-023 | in_progress | Branch feature/us-023-stripe-checkout-and-billing-portal created; building Stripe Checkout session creation for Plus/Pro upgrades, Billing Portal session for subscription management, and a duplicate-tier checkout guard.
2026-08-13T23:42:40.000Z | US-023 | pending | Crash resume: the 2026-08-13T21:46:18.000Z in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch, no PR found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-13T23:45:00.000Z | US-023 | in_progress | Branch feature/us-023-stripe-checkout-and-billing-portal created; building Stripe Checkout session creation for Plus/Pro upgrades, Billing Portal session for subscription management, and a duplicate-tier checkout guard.
2026-08-14T01:50:17.000Z | US-023 | pending | Crash resume: the 2026-08-13T23:45:00.000Z in_progress marker's story-start run died before creating the branch or PR on remote (no local/remote branch, no PR found); no work exists to resume, so reset to pending for clean re-selection.
2026-08-14T01:52:00.000Z | US-023 | in_progress | Branch feature/us-023-stripe-checkout-and-billing-portal created; building Stripe Checkout session creation for Plus/Pro upgrades, Billing Portal session for subscription management, and a duplicate-tier checkout guard.
2026-08-14T02:23:59.000Z | US-023 | needs_human | Implementation complete and pushed to feature/us-023-stripe-checkout-and-billing-portal (not opened as a PR -- known red). Also corrected the STRIPE_PRICE_ID_PLUS/STRIPE_PRICE_ID_PRO repo secrets, which held Stripe Product ids instead of Price ids. GET /billing/status, POST /billing/portal-session, and the 409 duplicate-checkout guard all verified working end-to-end against the real shared dev DB/Supabase/Stripe. POST /billing/checkout-session's real Stripe Checkout Session creation call (required by docs/testing.md's demo strategy) 502s because the Stripe test account has never had a business/account name set -- that field only accepts a live Stripe key or a Dashboard login, neither available to this pipeline. Filed issue #54 with the exact fix and resume steps; all 13 previously-done stories' demo specs re-verified passing.
2026-08-14T06:00:00.000Z | US-025 | in_progress | Branch feature/us-025-read-only-share-link created; building the read-only share link (owner generate/revoke/idempotent-fetch under /api/projects/:projectId/share-link, public read-only render at /api/shared/:token and /shared/:token) reusing DocumentPreview for the read-only render.
