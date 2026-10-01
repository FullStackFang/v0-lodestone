CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"component" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"disposition" text,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "card_review_kind" CHECK ("card_review"."kind" in ('challenge', 'evidence', 'test', 'help')),
	CONSTRAINT "card_review_disposition" CHECK ("card_review"."disposition" is null or "card_review"."disposition" in ('addressed', 'deferred', 'disagreed'))
);
--> statement-breakpoint
CREATE TABLE "card_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "card_revision_version_key" UNIQUE("card_id","version"),
	CONSTRAINT "card_revision_visibility" CHECK ("card_revision"."visibility" in ('unlisted', 'cohort'))
);
--> statement-breakpoint
CREATE TABLE "idea_experiment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"revision_id" uuid,
	"owner_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"method" text NOT NULL,
	"criterion" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"result" text,
	"evidence_type" text,
	"share_result" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_experiment_status" CHECK ("idea_experiment"."status" in ('planned', 'running', 'complete')),
	CONSTRAINT "idea_experiment_result" CHECK ("idea_experiment"."status" <> 'complete' or (length(trim("idea_experiment"."result")) > 0 and "idea_experiment"."evidence_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "founder_introductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_result_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "founder_introductions_pair" UNIQUE("requester_id","recipient_id"),
	CONSTRAINT "founder_introduction_status_valid" CHECK ("founder_introductions"."status" in ('pending', 'accepted', 'declined')),
	CONSTRAINT "founder_introduction_not_self" CHECK ("founder_introductions"."requester_id" <> "founder_introductions"."recipient_id"),
	CONSTRAINT "founder_introduction_response_valid" CHECK (("founder_introductions"."status" = 'pending') = ("founder_introductions"."responded_at" is null))
);
--> statement-breakpoint
CREATE TABLE "founder_preferences" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"discoverable" boolean DEFAULT false NOT NULL,
	"availability" text DEFAULT 'unavailable' NOT NULL,
	"intent" text DEFAULT 'cofounder' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "founder_availability_valid" CHECK ("founder_preferences"."availability" in ('unavailable', 'exploring', 'part_time', 'full_time')),
	CONSTRAINT "founder_intent_valid" CHECK ("founder_preferences"."intent" in ('cofounder', 'collaborator'))
);
--> statement-breakpoint
CREATE TABLE "curated_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curator_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"identifier" text NOT NULL,
	"source_date" text NOT NULL,
	"raw_text" text NOT NULL,
	"canonical_text" text NOT NULL,
	"text_hash" text NOT NULL,
	"claims" jsonb NOT NULL,
	"proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_resources_source_text_key" UNIQUE("source_url","text_hash"),
	CONSTRAINT "curated_resources_kind_check" CHECK ("curated_resources"."kind" in ('paper', 'patent', 'technology_disclosure'))
);
--> statement-breakpoint
CREATE TABLE "idea_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"criteria" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monitoring" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	CONSTRAINT "idea_needs_status_check" CHECK ("idea_needs"."status" in ('active', 'paused', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "resource_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"need_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"need_revision" integer NOT NULL,
	"score" real NOT NULL,
	"explanation" jsonb NOT NULL,
	"outcome" text,
	"outcome_note" text,
	"outcome_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_recommendations_pair_key" UNIQUE("need_id","resource_id"),
	CONSTRAINT "resource_recommendations_outcome_check" CHECK ("resource_recommendations"."outcome" is null or "resource_recommendations"."outcome" in ('dismissed', 'helped', 'not_helpful'))
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "auth_session_id" text;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_review" ADD CONSTRAINT "card_review_revision_id_card_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."card_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_review" ADD CONSTRAINT "card_review_reviewer_id_person_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_revision" ADD CONSTRAINT "card_revision_card_id_thesis_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."thesis_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_revision" ADD CONSTRAINT "card_revision_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_experiment" ADD CONSTRAINT "idea_experiment_card_id_thesis_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."thesis_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_experiment" ADD CONSTRAINT "idea_experiment_revision_id_card_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."card_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_experiment" ADD CONSTRAINT "idea_experiment_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD CONSTRAINT "founder_introductions_match_result_id_match_results_id_fk" FOREIGN KEY ("match_result_id") REFERENCES "public"."match_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD CONSTRAINT "founder_introductions_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD CONSTRAINT "founder_introductions_recipient_id_person_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_preferences" ADD CONSTRAINT "founder_preferences_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_resources" ADD CONSTRAINT "curated_resources_curator_id_person_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_needs" ADD CONSTRAINT "idea_needs_card_id_thesis_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."thesis_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_needs" ADD CONSTRAINT "idea_needs_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_need_id_idea_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."idea_needs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_resource_id_curated_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."curated_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "card_review_revision_idx" ON "card_review" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "card_review_reviewer_idx" ON "card_review" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "card_revision_owner_idx" ON "card_revision" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idea_experiment_card_idx" ON "idea_experiment" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "idea_experiment_owner_idx" ON "idea_experiment" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idea_experiment_revision_idx" ON "idea_experiment" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "founder_introductions_recipient_idx" ON "founder_introductions" USING btree ("recipient_id","requested_at");--> statement-breakpoint
CREATE INDEX "founder_introductions_match_idx" ON "founder_introductions" USING btree ("match_result_id");--> statement-breakpoint
CREATE INDEX "curated_resources_created_idx" ON "curated_resources" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "curated_resources_curator_idx" ON "curated_resources" USING btree ("curator_id");--> statement-breakpoint
CREATE INDEX "idea_needs_owner_idx" ON "idea_needs" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "idea_needs_card_idx" ON "idea_needs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "resource_recommendations_need_idx" ON "resource_recommendations" USING btree ("need_id");--> statement-breakpoint
CREATE INDEX "resource_recommendations_resource_idx" ON "resource_recommendations" USING btree ("resource_id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_auth_session_id_unique" UNIQUE("auth_session_id");