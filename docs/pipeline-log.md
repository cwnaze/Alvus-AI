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
