CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"action_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"token_cost_input" integer,
	"token_cost_output" integer,
	"billing_period" date NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_user_billing_period_action_idx" ON "usage_events" USING btree ("user_id","billing_period","action_type");--> statement-breakpoint
CREATE INDEX "usage_events_created_at_idx" ON "usage_events" USING btree ("created_at");