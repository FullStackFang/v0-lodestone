import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { pilotDailyActivity } from "@/db/measurement-schema";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "./test-fixtures";
import { cleanupPilotActivity, measurementDecision, recordPilotActivity, withdrawMeasurement } from "./measurement";

let db: Db;
let participant: string;
beforeEach(async () => {
  db = await createPgliteDb();
  participant = await ensurePerson(db, { name: "Participant", email: "measurement@example.test" });
  await enrollTestMember(db, participant, "participant");
});

describe("optional pilot measurement", () => {
  it("does not block work or record activity when declined", async () => {
    const consent = await measurementDecision(db, participant, { consent: false, noticeVersion: "measurement-v1" }, new Date("2026-09-01T12:00:00Z"));
    expect(consent.status).toBe("declined");
    expect(await recordPilotActivity(db, participant, new Date("2026-09-02T23:59:00Z"))).toBe(false);
  });

  it("stores at most one content-free UTC-day row and excludes operator/test members", async () => {
    await measurementDecision(db, participant, { consent: true, noticeVersion: "measurement-v1" }, new Date("2026-09-01T12:00:00Z"));
    expect(await recordPilotActivity(db, participant, new Date("2026-09-02T23:59:00Z"))).toBe(true);
    expect(await recordPilotActivity(db, participant, new Date("2026-09-02T00:01:00Z"))).toBe(false);
    expect(await db.select().from(pilotDailyActivity)).toEqual([{ personId: participant, activityDate: "2026-09-02" }]);

    for (const kind of ["operator", "test"] as const) {
      const id = await ensurePerson(db, { name: kind, email: `${kind}@measurement.test` });
      await enrollTestMember(db, id, kind);
      await expect(measurementDecision(db, id, { consent: true, noticeVersion: "measurement-v1" })).rejects.toThrow(/participant/);
    }
  });

  it("serializes withdrawal, deletes activity, and prevents later writes", async () => {
    await measurementDecision(db, participant, { consent: true, noticeVersion: "measurement-v1" }, new Date("2026-09-01T12:00:00Z"));
    await recordPilotActivity(db, participant, new Date("2026-09-02T12:00:00Z"));
    await withdrawMeasurement(db, participant, new Date("2026-09-03T12:00:00Z"));
    expect(await db.select().from(pilotDailyActivity).where(eq(pilotDailyActivity.personId, participant))).toEqual([]);
    expect(await recordPilotActivity(db, participant, new Date("2026-09-03T13:00:00Z"))).toBe(false);
  });

  it("purges activity only after 90 days", async () => {
    await measurementDecision(db, participant, { consent: true, noticeVersion: "measurement-v1" }, new Date("2026-05-01T00:00:00Z"));
    await recordPilotActivity(db, participant, new Date("2026-06-01T12:00:00Z"));
    await recordPilotActivity(db, participant, new Date("2026-08-31T12:00:00Z"));
    expect(await cleanupPilotActivity(db, new Date("2026-09-06T00:00:00Z"))).toBe(1);
    expect(await db.select().from(pilotDailyActivity)).toHaveLength(1);
  });
});
