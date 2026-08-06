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
