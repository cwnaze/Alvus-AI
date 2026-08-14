CREATE TABLE "share_link_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "share_link_lookups_ip_created_at_idx" ON "share_link_lookups" USING btree ("ip_address","created_at");