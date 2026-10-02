CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"ats" text NOT NULL,
	"token" text NOT NULL,
	"careers_url" text,
	"signal" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"actor" text DEFAULT 'agent' NOT NULL,
	"payload" jsonb,
	"screenshot_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_hash" text NOT NULL,
	"company_id" uuid,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"company" text NOT NULL,
	"company_normalized" text NOT NULL,
	"title" text NOT NULL,
	"title_normalized" text NOT NULL,
	"url" text NOT NULL,
	"apply_url" text,
	"location_raw" text,
	"locations" jsonb DEFAULT '[]'::jsonb,
	"work_mode" text,
	"seniority" text,
	"description_text" text,
	"salary_min" real,
	"salary_max" real,
	"salary_currency" text,
	"salary_inr_lpa" real,
	"posted_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score" integer,
	"tier" integer,
	"breakdown" jsonb,
	"matched_skills" jsonb DEFAULT '[]'::jsonb,
	"gaps" jsonb DEFAULT '[]'::jsonb,
	"ghost_score" real DEFAULT 0,
	"ghost_reasons" jsonb DEFAULT '[]'::jsonb,
	"disqualified" text,
	"seen_on" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'to_apply' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_ats_token_idx" ON "companies" USING btree ("ats","token");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedup_hash_idx" ON "jobs" USING btree ("dedup_hash");--> statement-breakpoint
CREATE INDEX "jobs_tier_idx" ON "jobs" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_first_seen_idx" ON "jobs" USING btree ("first_seen_at");