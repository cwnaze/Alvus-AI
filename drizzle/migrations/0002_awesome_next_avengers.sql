CREATE TABLE "external_works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doi" text,
	"semantic_scholar_id" text,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abstract" text,
	"publication_year" integer,
	"venue" text,
	"external_ids" jsonb,
	"oa_status" text,
	"oa_url" text,
	"full_text_fetched" boolean DEFAULT false NOT NULL,
	"full_text_storage_path" text,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"external_work_id" uuid,
	"state" text DEFAULT 'candidate' NOT NULL,
	"citation_string" text,
	"strengths_summary" text,
	"weaknesses_summary" text,
	"usefulness_score" numeric(4, 2),
	"key_quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"full_text_available" boolean DEFAULT false NOT NULL,
	"full_text_source" text,
	"analyzed_at" timestamp with time zone,
	"selected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_sources_origin_external_work_id_check" CHECK (origin != 'discovered' or external_work_id is not null)
);
--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_external_work_id_external_works_id_fk" FOREIGN KEY ("external_work_id") REFERENCES "public"."external_works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_works_doi_idx" ON "external_works" USING btree ("doi") WHERE "external_works"."doi" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "external_works_semantic_scholar_id_idx" ON "external_works" USING btree ("semantic_scholar_id") WHERE "external_works"."semantic_scholar_id" is not null;--> statement-breakpoint
CREATE INDEX "project_sources_project_id_idx" ON "project_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_sources_project_id_state_idx" ON "project_sources" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "project_sources_external_work_id_idx" ON "project_sources" USING btree ("external_work_id");