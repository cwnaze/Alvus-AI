-- Enable Row Level Security across every application table and add explicit,
-- ownership-scoped read policies (US-026). Once RLS is enabled on a table,
-- Postgres denies any command with no matching policy -- so a table listed
-- here with no `create policy` for a given command (e.g. every INSERT/
-- UPDATE/DELETE, and share_link_lookups' SELECT) is deliberately left denied
-- for anon/authenticated, not an oversight.
--
-- Writes are never granted to anon/authenticated at all: the app performs
-- every mutation over `DATABASE_URL` as the `postgres` role (service-role
-- path, RLS-bypassing by ownership -- see docs/data-model.md and
-- docs/security.md's per-resource table). The explicit REVOKE below makes
-- that "no direct write path" invariant durable regardless of
-- `auto_expose_new_tables` or a future accidental GRANT.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
--> statement-breakpoint
-- Shared building block so "owner_id = auth.uid()" alone isn't mistaken for
-- the whole authorization rule -- docs/security.md requires the waitlist
-- approval gate too, checked here at the database level, not just by the
-- Hono `requireApproved` middleware. `security invoker` (the default, named
-- explicitly) means this runs as the calling role, so it only ever reads the
-- caller's own `users` row -- which `users_select_own` below already permits
-- -- no need for `security definer`.
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and status = 'approved'
  );
$$;
--> statement-breakpoint
-- users: self-read only, no approval gate -- GET /auth/me must still work for
-- a pending/rejected account (see middleware/auth.ts's requireApproved
-- carve-out for that route).
alter table public.users enable row level security;
--> statement-breakpoint
create policy users_select_own on public.users for select to authenticated using (id = auth.uid());
--> statement-breakpoint
grant select on public.users to authenticated;
--> statement-breakpoint
-- waitlist_signups: self-read only; admin reads go through the service role.
alter table public.waitlist_signups enable row level security;
--> statement-breakpoint
create policy waitlist_signups_select_own on public.waitlist_signups for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
grant select on public.waitlist_signups to authenticated;
--> statement-breakpoint
-- projects: owner + approved-status gate, matching docs/security.md's
-- authorization table ("auth.uid() = owner_id AND users.status = 'approved'").
alter table public.projects enable row level security;
--> statement-breakpoint
create policy projects_select_own on public.projects for select to authenticated using (owner_id = auth.uid() and public.is_approved_user());
--> statement-breakpoint
grant select on public.projects to authenticated;
--> statement-breakpoint
-- project_documents: no owner_id column of its own -- scoped via the parent
-- project, same as the app layer's loadOwnedProject.
alter table public.project_documents enable row level security;
--> statement-breakpoint
create policy project_documents_select_own on public.project_documents for select to authenticated using (
  public.is_approved_user()
  and exists (select 1 from public.projects p where p.id = project_documents.project_id and p.owner_id = auth.uid())
);
--> statement-breakpoint
grant select on public.project_documents to authenticated;
--> statement-breakpoint
-- project_sources: same project-scoped pattern.
alter table public.project_sources enable row level security;
--> statement-breakpoint
create policy project_sources_select_own on public.project_sources for select to authenticated using (
  public.is_approved_user()
  and exists (select 1 from public.projects p where p.id = project_sources.project_id and p.owner_id = auth.uid())
);
--> statement-breakpoint
grant select on public.project_sources to authenticated;
--> statement-breakpoint
-- feedback_passes: same project-scoped pattern.
alter table public.feedback_passes enable row level security;
--> statement-breakpoint
create policy feedback_passes_select_own on public.feedback_passes for select to authenticated using (
  public.is_approved_user()
  and exists (select 1 from public.projects p where p.id = feedback_passes.project_id and p.owner_id = auth.uid())
);
--> statement-breakpoint
grant select on public.feedback_passes to authenticated;
--> statement-breakpoint
-- uploaded_files: owner_id is denormalized specifically so this check
-- doesn't need a project join (see docs/data-model.md's uploaded_files entry).
alter table public.uploaded_files enable row level security;
--> statement-breakpoint
create policy uploaded_files_select_own on public.uploaded_files for select to authenticated using (owner_id = auth.uid() and public.is_approved_user());
--> statement-breakpoint
grant select on public.uploaded_files to authenticated;
--> statement-breakpoint
-- share_links: the owner can see their own project's links. A share-link
-- *holder* never reaches this table at all -- resolution is unauthenticated
-- and served entirely by the Worker's service-role connection
-- (docs/security.md: "RLS can't apply"), so there is deliberately no policy
-- admitting an anon/authenticated read by token match.
alter table public.share_links enable row level security;
--> statement-breakpoint
create policy share_links_select_own on public.share_links for select to authenticated using (created_by = auth.uid() and public.is_approved_user());
--> statement-breakpoint
grant select on public.share_links to authenticated;
--> statement-breakpoint
-- share_link_lookups: internal IP-keyed rate-limit bookkeeping, not owned by
-- any user -- RLS enabled with zero policies, so anon/authenticated are
-- denied outright. No GRANT either.
alter table public.share_link_lookups enable row level security;
--> statement-breakpoint
-- usage_events / suggestion_requests: self-read only, append-only, written
-- exclusively by the service-role connection.
alter table public.usage_events enable row level security;
--> statement-breakpoint
create policy usage_events_select_own on public.usage_events for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
grant select on public.usage_events to authenticated;
--> statement-breakpoint
alter table public.suggestion_requests enable row level security;
--> statement-breakpoint
create policy suggestion_requests_select_own on public.suggestion_requests for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
grant select on public.suggestion_requests to authenticated;
--> statement-breakpoint
-- external_works / tier_limits: public, non-sensitive data -- readable by
-- anyone, including a signed-out anon key (docs/data-model.md's sensitivity
-- summary lists both as "not sensitive").
alter table public.external_works enable row level security;
--> statement-breakpoint
create policy external_works_select_all on public.external_works for select to anon, authenticated using (true);
--> statement-breakpoint
grant select on public.external_works to anon, authenticated;
--> statement-breakpoint
alter table public.tier_limits enable row level security;
--> statement-breakpoint
create policy tier_limits_select_all on public.tier_limits for select to anon, authenticated using (true);
--> statement-breakpoint
grant select on public.tier_limits to anon, authenticated;
