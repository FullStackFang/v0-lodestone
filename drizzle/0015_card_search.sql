CREATE TABLE "card_search" (
	"idea_id" text NOT NULL,
	"block" text NOT NULL,
	"text_hash" text NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "card_search_idea_id_block_pk" PRIMARY KEY("idea_id","block"),
	CONSTRAINT "card_search_state_valid" CHECK ("card_search"."state" in ('running', 'done'))
);
--> statement-breakpoint
ALTER TABLE "card_search" ADD CONSTRAINT "card_search_idea_id_forge_card_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."forge_card"("idea_id") ON DELETE cascade ON UPDATE no action;