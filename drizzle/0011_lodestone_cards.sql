CREATE TABLE "forge_card" (
	"idea_id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"line" text NOT NULL,
	"doc" jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"published_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forge_card_visibility_valid" CHECK ("forge_card"."visibility" in ('private', 'cohort')),
	CONSTRAINT "forge_card_published_when_visible" CHECK (("forge_card"."visibility" = 'cohort') = ("forge_card"."published_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "forge_card" ADD CONSTRAINT "forge_card_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forge_card_owner_idx" ON "forge_card" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "forge_card_visibility_idx" ON "forge_card" USING btree ("visibility","published_at");