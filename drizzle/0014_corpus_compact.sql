ALTER TABLE "document" ALTER COLUMN "text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunk" ALTER COLUMN "text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunk" ALTER COLUMN "embedding" SET DATA TYPE halfvec(1024) USING "embedding"::halfvec(1024);--> statement-breakpoint
-- One copy of each corpus abstract: its artifact_texts row. A corpus document
-- without one keeps its text. `source::text`, because `patent` joined the enum
-- in 0013 and a database migrating both at once would refuse the new label
-- inside the same transaction.
UPDATE "document_chunk" SET "text" = NULL FROM "document" WHERE "document"."id" = "document_chunk"."document_id" AND "document"."source"::text IN ('paper', 'patent') AND EXISTS (SELECT 1 FROM "artifact_texts" WHERE "artifact_texts"."artifact_id" = "document"."id");--> statement-breakpoint
UPDATE "document" SET "text" = NULL WHERE "source"::text IN ('paper', 'patent') AND EXISTS (SELECT 1 FROM "artifact_texts" WHERE "artifact_texts"."artifact_id" = "document"."id");--> statement-breakpoint
CREATE INDEX "document_chunk_embedding_hnsw" ON "document_chunk" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_text_required" CHECK ("document"."source" not in ('deck', 'resume') or "document"."text" is not null);
