CREATE TABLE "pilot_daily_activity" (
	"person_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	CONSTRAINT "pilot_daily_activity_person_day_pk" PRIMARY KEY("person_id","activity_date")
);
--> statement-breakpoint
CREATE TABLE "pilot_measurement_consent" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"notice_version" text NOT NULL,
	"decision_at" timestamp with time zone NOT NULL,
	"consented_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "pilot_measurement_status_check" CHECK (
    ("pilot_measurement_consent"."status" = 'consented' and "pilot_measurement_consent"."consented_at" is not null and "pilot_measurement_consent"."withdrawn_at" is null)
    or ("pilot_measurement_consent"."status" = 'declined' and "pilot_measurement_consent"."consented_at" is null and "pilot_measurement_consent"."withdrawn_at" is null)
    or ("pilot_measurement_consent"."status" = 'withdrawn' and "pilot_measurement_consent"."consented_at" is not null and "pilot_measurement_consent"."withdrawn_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "pilot_daily_activity" ADD CONSTRAINT "pilot_daily_activity_person_id_pilot_measurement_consent_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."pilot_measurement_consent"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_measurement_consent" ADD CONSTRAINT "pilot_measurement_consent_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pilot_measurement_status_idx" ON "pilot_measurement_consent" USING btree ("status","consented_at");