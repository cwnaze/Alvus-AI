CREATE TABLE "auth_rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"endpoint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_rate_limit_attempts" ADD CONSTRAINT "ai_rate_limit_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_rate_limit_attempts_ip_endpoint_created_at_idx" ON "auth_rate_limit_attempts" USING btree ("ip_address","endpoint","created_at");--> statement-breakpoint
CREATE INDEX "ai_rate_limit_attempts_user_action_created_at_idx" ON "ai_rate_limit_attempts" USING btree ("user_id","action_type","created_at");
--> statement-breakpoint
-- Both tables postdate 0011_enable_row_level_security.sql, so (per that
-- migration's convention, also followed by 0012's subscriptions table) they
-- get their own RLS grant here rather than waiting for a future sweep.
--
-- auth_rate_limit_attempts: internal IP-keyed rate-limit bookkeeping for
-- unauthenticated endpoints (signup/login/password-reset), not owned by any
-- user -- RLS enabled with zero policies, same as share_link_lookups, so
-- anon/authenticated are denied outright. No GRANT either.
revoke insert, update, delete, truncate on public.auth_rate_limit_attempts from anon, authenticated;
--> statement-breakpoint
alter table public.auth_rate_limit_attempts enable row level security;
--> statement-breakpoint
-- ai_rate_limit_attempts: self-read only, append-only, written exclusively by
-- the service-role connection -- same pattern as suggestion_requests.
revoke insert, update, delete, truncate on public.ai_rate_limit_attempts from anon, authenticated;
--> statement-breakpoint
alter table public.ai_rate_limit_attempts enable row level security;
--> statement-breakpoint
create policy ai_rate_limit_attempts_select_own on public.ai_rate_limit_attempts for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
grant select on public.ai_rate_limit_attempts to authenticated;
