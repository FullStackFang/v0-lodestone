CREATE TABLE "refresh_lease" (
	"scope" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"fencing_token" integer NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refresh_lease_scope_check" CHECK ("refresh_lease"."scope" = 'global')
);
--> statement-breakpoint
CREATE TABLE "refresh_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"scope" text NOT NULL,
	"owner_id" uuid,
	"correlation_key" text NOT NULL,
	"attempt" integer NOT NULL,
	"fencing_token" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"resources" integer DEFAULT 0 NOT NULL,
	"checked" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "refresh_run_correlation_attempt_key" UNIQUE("trigger","correlation_key","attempt"),
	CONSTRAINT "refresh_run_trigger_check" CHECK ("refresh_run"."trigger" in ('scheduled', 'manual_owner', 'manual_operator')),
	CONSTRAINT "refresh_run_scope_check" CHECK ("refresh_run"."scope" in ('global', 'owner')),
	CONSTRAINT "refresh_run_status_check" CHECK ("refresh_run"."status" in ('running', 'succeeded', 'failed', 'interrupted')),
	CONSTRAINT "refresh_run_scope_owner_check" CHECK (("refresh_run"."scope" = 'owner' and "refresh_run"."owner_id" is not null) or ("refresh_run"."scope" = 'global' and "refresh_run"."owner_id" is null)),
	CONSTRAINT "refresh_run_attempt_check" CHECK ("refresh_run"."attempt" between 1 and 3),
	CONSTRAINT "refresh_run_progress_check" CHECK ("refresh_run"."resources" >= 0 and "refresh_run"."checked" >= 0 and "refresh_run"."created" >= 0 and "refresh_run"."updated" >= 0)
);
--> statement-breakpoint
ALTER TABLE "refresh_lease" ADD CONSTRAINT "refresh_lease_run_id_refresh_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."refresh_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_run" ADD CONSTRAINT "refresh_run_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_run_global_history_idx" ON "refresh_run" USING btree ("scope","started_at");--> statement-breakpoint
CREATE INDEX "refresh_run_owner_history_idx" ON "refresh_run" USING btree ("owner_id","started_at");