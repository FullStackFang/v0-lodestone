CREATE TABLE "pilot_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"notice_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_person_id" uuid,
	"revoked_at" timestamp with time zone,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_attempted_at" timestamp with time zone,
	"delivery_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "pilot_invitation_email_normalized" CHECK ("pilot_invitation"."email" = lower(trim("pilot_invitation"."email"))),
	CONSTRAINT "pilot_invitation_status_valid" CHECK ("pilot_invitation"."status" in ('pending', 'accepted', 'revoked')),
	CONSTRAINT "pilot_invitation_delivery_valid" CHECK ("pilot_invitation"."delivery_status" in ('pending', 'sent', 'failed')),
	CONSTRAINT "pilot_invitation_expiry_valid" CHECK ("pilot_invitation"."expires_at" > "pilot_invitation"."created_at"),
	CONSTRAINT "pilot_invitation_lifecycle_valid" CHECK (
    ("pilot_invitation"."status" = 'pending' and "pilot_invitation"."accepted_at" is null and "pilot_invitation"."accepted_person_id" is null and "pilot_invitation"."revoked_at" is null)
    or ("pilot_invitation"."status" = 'accepted' and "pilot_invitation"."accepted_at" is not null and "pilot_invitation"."accepted_person_id" is not null and "pilot_invitation"."revoked_at" is null)
    or ("pilot_invitation"."status" = 'revoked' and "pilot_invitation"."accepted_at" is null and "pilot_invitation"."accepted_person_id" is null and "pilot_invitation"."revoked_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "pilot_membership" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"invitation_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"member_kind" text DEFAULT 'participant' NOT NULL,
	"notice_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_membership_invitation_id_unique" UNIQUE("invitation_id"),
	CONSTRAINT "pilot_membership_status_valid" CHECK ("pilot_membership"."status" in ('active', 'revoked')),
	CONSTRAINT "pilot_membership_kind_valid" CHECK ("pilot_membership"."member_kind" in ('participant', 'operator', 'test')),
	CONSTRAINT "pilot_membership_lifecycle_valid" CHECK (
    ("pilot_membership"."status" = 'active' and "pilot_membership"."revoked_at" is null)
    or ("pilot_membership"."status" = 'revoked' and "pilot_membership"."revoked_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "founder_introductions" DROP CONSTRAINT "founder_introductions_pair";--> statement-breakpoint
ALTER TABLE "founder_introductions" DROP CONSTRAINT "founder_introduction_status_valid";--> statement-breakpoint
ALTER TABLE "founder_introductions" DROP CONSTRAINT "founder_introduction_response_valid";--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "pilot_invitation" ADD CONSTRAINT "pilot_invitation_accepted_person_id_person_id_fk" FOREIGN KEY ("accepted_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_membership" ADD CONSTRAINT "pilot_membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_membership" ADD CONSTRAINT "pilot_membership_invitation_id_pilot_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."pilot_invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pilot_invitation_email_status_idx" ON "pilot_invitation" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "pilot_membership_status_idx" ON "pilot_membership" USING btree ("status","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "founder_introductions_pending_pair" ON "founder_introductions" USING btree (least("requester_id", "recipient_id"),greatest("requester_id", "recipient_id")) WHERE "founder_introductions"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD CONSTRAINT "founder_introduction_status_valid" CHECK ("founder_introductions"."status" in ('pending', 'accepted', 'declined', 'cancelled'));--> statement-breakpoint
ALTER TABLE "founder_introductions" ADD CONSTRAINT "founder_introduction_response_valid" CHECK (
    ("founder_introductions"."status" = 'pending' and "founder_introductions"."responded_at" is null and "founder_introductions"."cancelled_at" is null and "founder_introductions"."cancellation_reason" is null)
    or ("founder_introductions"."status" in ('accepted', 'declined') and "founder_introductions"."responded_at" is not null and "founder_introductions"."cancelled_at" is null and "founder_introductions"."cancellation_reason" is null)
    or ("founder_introductions"."status" = 'cancelled' and "founder_introductions"."responded_at" is null and "founder_introductions"."cancelled_at" is not null and length(trim("founder_introductions"."cancellation_reason")) > 0)
  );--> statement-breakpoint
UPDATE "card_revision"
SET "revoked_at" = now()
WHERE "visibility" = 'cohort' AND "revoked_at" IS NULL;--> statement-breakpoint
UPDATE "founder_preferences"
SET "discoverable" = false, "updated_at" = now()
WHERE "discoverable" = true;--> statement-breakpoint
UPDATE "founder_introductions"
SET "status" = 'cancelled',
    "cancelled_at" = now(),
    "cancellation_reason" = 'pilot_membership_migration'
WHERE "status" = 'pending';
