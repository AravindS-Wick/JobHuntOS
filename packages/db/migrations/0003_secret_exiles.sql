CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"human_prompt" jsonb,
	"application_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"apply_url" text NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"resume_variant_id" uuid,
	"cover_letter" text,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_fields" jsonb,
	"blocked_reason" text,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"screenshot_path" text,
	"approved_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"doc" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"docx_path" text,
	"pdf_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"file_path" text,
	"raw_text" text NOT NULL,
	"doc" jsonb NOT NULL,
	"is_master" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_variant_id_resume_variants_id_fk" FOREIGN KEY ("resume_variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "agent_tasks_application_idx" ON "agent_tasks" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_platform_submitted_idx" ON "applications" USING btree ("platform","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_variants_resume_job_idx" ON "resume_variants" USING btree ("resume_id","job_id");