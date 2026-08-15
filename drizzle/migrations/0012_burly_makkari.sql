CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- subscriptions: self-read only, written exclusively by the service-role
-- connection (Stripe webhook + checkout/portal handlers) -- same pattern as
-- usage_events/suggestion_requests in 0011_enable_row_level_security.sql.
-- This table postdates that migration, so it needs its own RLS grant here.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
--> statement-breakpoint
alter table public.subscriptions enable row level security;
--> statement-breakpoint
create policy subscriptions_select_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
grant select on public.subscriptions to authenticated;
