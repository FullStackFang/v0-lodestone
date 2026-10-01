ALTER TABLE "refresh_lease" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
INSERT INTO "refresh_lease" ("scope", "run_id", "fencing_token", "heartbeat_at", "expires_at")
VALUES ('global', NULL, 0, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z')
ON CONFLICT ("scope") DO NOTHING;
