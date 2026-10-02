CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"value" jsonb NOT NULL,
	"evidence" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "facts_key_idx" ON "facts" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "facts_category_idx" ON "facts" USING btree ("category");