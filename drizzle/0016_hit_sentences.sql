ALTER TYPE "public"."source_format" ADD VALUE 'tldr';--> statement-breakpoint
CREATE TABLE "document_sentence" (
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text_hash" text NOT NULL,
	"start_off" integer NOT NULL,
	"end_off" integer NOT NULL,
	"embedding" halfvec(1024) NOT NULL,
	CONSTRAINT "document_sentence_document_id_ordinal_pk" PRIMARY KEY("document_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "document_sentence" ADD CONSTRAINT "document_sentence_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;