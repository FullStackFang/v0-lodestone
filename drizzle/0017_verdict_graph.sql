CREATE TABLE "paper_block_verdict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"block" text NOT NULL,
	"idea_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"block_embedding" halfvec(1024) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_block_verdict_verdict_valid" CHECK ("paper_block_verdict"."verdict" in ('useful', 'known', 'not_relevant'))
);
--> statement-breakpoint
ALTER TABLE "paper_block_verdict" ADD CONSTRAINT "paper_block_verdict_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_block_verdict" ADD CONSTRAINT "paper_block_verdict_idea_id_forge_card_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."forge_card"("idea_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_block_verdict" ADD CONSTRAINT "paper_block_verdict_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_block_verdict_one_opinion" ON "paper_block_verdict" USING btree ("document_id","block","idea_id","person_id");