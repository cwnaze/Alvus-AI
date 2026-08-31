-- 0011_enable_row_level_security.sql granted SELECT explicitly, per table, to
-- exactly the roles meant to have it -- but it only ever revoked
-- `insert, update, delete, truncate`. Supabase's database template grants
-- SELECT on every table in `public` to `anon` and `authenticated` by default,
-- so the tables deliberately left un-granted (share_link_lookups,
-- auth_rate_limit_attempts, and `anon` on every private table) still carried
-- a table-level SELECT privilege from the template.
--
-- RLS still filtered those reads to zero rows, so this was never a data leak.
-- The consequence was that the invariant those migrations describe -- "no
-- GRANT either", so the read is refused by the grant system before RLS is
-- consulted -- was not actually true, and tests asserting a permission-denied
-- error saw an empty result set instead. Revoke the template's blanket grant
-- and re-issue only the intended ones, so the grant layer and the policy
-- layer agree.
revoke select on all tables in schema public from anon, authenticated;
--> statement-breakpoint
-- Re-grant exactly the set from 0011, 0012 and 0013. Owner-scoped tables:
-- readable by `authenticated` only, still filtered by their select policy.
grant select on public.users to authenticated;
--> statement-breakpoint
grant select on public.waitlist_signups to authenticated;
--> statement-breakpoint
grant select on public.projects to authenticated;
--> statement-breakpoint
grant select on public.project_documents to authenticated;
--> statement-breakpoint
grant select on public.project_sources to authenticated;
--> statement-breakpoint
grant select on public.feedback_passes to authenticated;
--> statement-breakpoint
grant select on public.uploaded_files to authenticated;
--> statement-breakpoint
grant select on public.share_links to authenticated;
--> statement-breakpoint
grant select on public.usage_events to authenticated;
--> statement-breakpoint
grant select on public.suggestion_requests to authenticated;
--> statement-breakpoint
grant select on public.subscriptions to authenticated;
--> statement-breakpoint
grant select on public.ai_rate_limit_attempts to authenticated;
--> statement-breakpoint
-- Public, non-sensitive reference data (docs/data-model.md's sensitivity
-- summary lists both as "not sensitive") -- readable by a signed-out anon key.
grant select on public.external_works to anon, authenticated;
--> statement-breakpoint
grant select on public.tier_limits to anon, authenticated;
--> statement-breakpoint
-- Deliberately NOT re-granted, matching 0011 and 0013: share_link_lookups
-- (IP-keyed share-link rate-limit bookkeeping) and auth_rate_limit_attempts
-- (IP-keyed auth rate-limit bookkeeping). Both are written and read only over
-- DATABASE_URL as the service role, have RLS on with zero policies, and are
-- now refused at the grant layer for anon and authenticated alike.
--
-- This revoke covers the tables that exist today. A table added later picks up
-- the template's default SELECT grant again, so each new table still needs its
-- own explicit revoke/grant block in its own migration -- the convention 0012
-- and 0013 already follow.
