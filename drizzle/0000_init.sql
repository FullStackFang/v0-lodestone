CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('draft', 'gated', 'complete');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('deck', 'resume', 'paper');--> statement-breakpoint
CREATE TYPE "public"."gate_result" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('intake', 'thesis', 'segment', 'jtbd', 'buyer', 'rubric', 'kill', 'render');--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source" "document_source" NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"page" integer,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"user_input_raw" text NOT NULL,
	"extracted_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gate_result" "gate_result" NOT NULL,
	"fail_reason" text,
	"proposed_gate" jsonb,
	"model_confidence" real,
	"questions_left" integer,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"usage" jsonb,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"reply" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thesis_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "card_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idea_text" text,
	"offering" text,
	"segment" jsonb,
	"value_proposition" text,
	"jtbd" jsonb,
	"economic_buyer" jsonb,
	"beachhead" jsonb,
	"four_us" jsonb,
	"rubric_scores" jsonb,
	"kill_assumption" jsonb,
	"facets" jsonb,
	"provenance" jsonb NOT NULL,
	"embedding" vector(1536),
	CONSTRAINT "thesis_card_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_card_id_thesis_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."thesis_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_card" ADD CONSTRAINT "thesis_card_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_session_idx" ON "document" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "document_chunk_document_idx" ON "document_chunk" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "stage_event_card_idx" ON "stage_event" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "thesis_card_session_idx" ON "thesis_card" USING btree ("session_id");