CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_bucket" text DEFAULT 'source-uploads' NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"title" text,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_files_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "uploaded_files_file_size_bytes_check" CHECK ("uploaded_files"."file_size_bytes" > 0 and "uploaded_files"."file_size_bytes" <= 20000000)
);
--> statement-breakpoint
ALTER TABLE "project_sources" ADD COLUMN "uploaded_file_id" uuid;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploaded_files_project_id_idx" ON "uploaded_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_owner_id_idx" ON "uploaded_files" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_uploaded_file_id_uploaded_files_id_fk" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_sources_uploaded_file_id_idx" ON "project_sources" USING btree ("uploaded_file_id");--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_origin_uploaded_file_id_check" CHECK (origin != 'uploaded' or uploaded_file_id is not null);