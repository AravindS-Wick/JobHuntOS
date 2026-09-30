CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sender" text NOT NULL,
	"sender_name" text,
	"recipient" text,
	"subject" text NOT NULL,
	"snippet" text,
	"body_text" text,
	"category" text DEFAULT 'other' NOT NULL,
	"company_mentioned" text,
	"company_normalized" text,
	"job_title_mentioned" text,
	"assessment_url" text,
	"interview_url" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_job_id" uuid,
	"action_required" boolean DEFAULT false NOT NULL,
	"suggested_action" text,
	"draft_reply" text,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_linked_job_id_jobs_id_fk" FOREIGN KEY ("linked_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_msg_id_idx" ON "inbox_messages" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "inbox_thread_idx" ON "inbox_messages" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "inbox_category_idx" ON "inbox_messages" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "inbox_received_idx" ON "inbox_messages" USING btree ("received_at");
--> statement-breakpoint
CREATE INDEX "inbox_linked_job_idx" ON "inbox_messages" USING btree ("linked_job_id");
