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
