CREATE TABLE "card_rank" (
	"idea_id" text NOT NULL,
	"import_seq" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hits" jsonb NOT NULL,
	"block_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "card_rank_idea_id_import_seq_pk" PRIMARY KEY("idea_id","import_seq")
);
--> statement-breakpoint
ALTER TABLE "forge_card" ADD COLUMN "import_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_rank" ADD CONSTRAINT "card_rank_idea_id_forge_card_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."forge_card"("idea_id") ON DELETE cascade ON UPDATE no action;