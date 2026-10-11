CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "card_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"idea_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"verdict" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_feedback_kind_valid" CHECK ("card_feedback"."kind" in ('paper', 'peer')),
	CONSTRAINT "card_feedback_verdict_valid" CHECK ("card_feedback"."verdict" in ('useful', 'known', 'not_relevant'))
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback" ADD CONSTRAINT "card_feedback_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback" ADD CONSTRAINT "card_feedback_idea_id_forge_card_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."forge_card"("idea_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_token_person_idx" ON "api_token" USING btree ("person_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "card_feedback_one_opinion" ON "card_feedback" USING btree ("person_id","idea_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "card_feedback_target_idx" ON "card_feedback" USING btree ("kind","target_id");