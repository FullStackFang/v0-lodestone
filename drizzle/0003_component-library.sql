CREATE TABLE "component_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"component" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_reference_key" UNIQUE("card_id","revision_id","component")
);
--> statement-breakpoint
ALTER TABLE "component_reference" ADD CONSTRAINT "component_reference_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_reference" ADD CONSTRAINT "component_reference_card_id_thesis_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."thesis_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_reference" ADD CONSTRAINT "component_reference_revision_id_card_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."card_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "component_reference_person_idx" ON "component_reference" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "component_reference_revision_idx" ON "component_reference" USING btree ("revision_id");