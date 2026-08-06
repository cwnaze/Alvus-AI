-- source-uploads: private bucket for user-uploaded PDF/TXT sources (US-017).
-- `storage.objects` has row level security enabled by default in Supabase, and this
-- bucket is created non-public, so with zero policies defined below no anon or
-- authenticated request can read or write objects in it yet -- private by default,
-- per docs/security.md's "uploaded_files ... entire row + Storage object" sensitivity
-- classification.
--
-- RLS-ready scaffolding only: the actual per-object policies (owner_id/project_id
-- scoped access via the `uploaded_files` table) land once that table and its owning
-- `projects` table exist (US-014, US-017) -- they can't be written correctly before
-- then.
insert into storage.buckets (id, name, public)
values ('source-uploads', 'source-uploads', false)
on conflict (id) do nothing;
