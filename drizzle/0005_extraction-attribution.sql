ALTER TABLE "extraction_runs" DROP CONSTRAINT "extraction_runs_key";--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD COLUMN "attribution_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_key" UNIQUE("text_hash","variant","prompt_version","model","attribution_key","attempt");