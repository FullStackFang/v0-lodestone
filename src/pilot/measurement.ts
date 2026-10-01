import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { pilotDailyActivity, pilotMeasurementConsent } from "@/db/measurement-schema";
import { pilotMembership } from "@/db/pilot-schema";

const Decision = z.object({ consent: z.boolean(), noticeVersion: z.string().trim().min(1).max(100) }).strict();

async function lockRealParticipant(db: Db, personId: string) {
  const [membership] = await db.select().from(pilotMembership)
    .where(eq(pilotMembership.personId, z.uuid().parse(personId))).for("update");
  if (!membership || membership.status !== "active" || membership.revokedAt || membership.memberKind !== "participant") {
    throw new Error("Measurement consent is available only to active pilot participants.");
  }
  return membership;
}

export async function measurementDecision(db: Db, personId: string, input: unknown, now = new Date()) {
  const value = Decision.parse(input);
  return db.transaction(async (tx) => {
    await lockRealParticipant(tx as unknown as Db, personId);
    const status = value.consent ? "consented" as const : "declined" as const;
    const [row] = await tx.insert(pilotMeasurementConsent).values({
      personId,
      status,
      noticeVersion: value.noticeVersion,
      decisionAt: now,
      consentedAt: value.consent ? now : null,
      withdrawnAt: null,
    }).onConflictDoUpdate({
      target: pilotMeasurementConsent.personId,
      set: { status, noticeVersion: value.noticeVersion, decisionAt: now, consentedAt: value.consent ? now : null, withdrawnAt: null },
    }).returning();
    if (!value.consent) await tx.delete(pilotDailyActivity).where(eq(pilotDailyActivity.personId, personId));
    return row;
  });
}

export async function measurementConsentFor(db: Db, personId: string) {
  const [row] = await db.select().from(pilotMeasurementConsent).where(eq(pilotMeasurementConsent.personId, personId)).limit(1);
  return row ?? null;
}

export async function recordPilotActivity(db: Db, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [consent] = await tx.select().from(pilotMeasurementConsent)
      .where(eq(pilotMeasurementConsent.personId, z.uuid().parse(personId))).for("update");
    if (!consent || consent.status !== "consented" || !consent.consentedAt || consent.withdrawnAt) return false;
    const [membership] = await tx.select().from(pilotMembership).where(eq(pilotMembership.personId, personId)).for("update");
    if (!membership || membership.status !== "active" || membership.revokedAt || membership.memberKind !== "participant") return false;
    const activityDate = now.toISOString().slice(0, 10);
    const inserted = await tx.insert(pilotDailyActivity).values({ personId, activityDate })
      .onConflictDoNothing({ target: [pilotDailyActivity.personId, pilotDailyActivity.activityDate] })
      .returning({ personId: pilotDailyActivity.personId });
    return inserted.length === 1;
  });
}

export async function withdrawMeasurement(db: Db, personId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [consent] = await tx.select().from(pilotMeasurementConsent)
      .where(eq(pilotMeasurementConsent.personId, z.uuid().parse(personId))).for("update");
    if (!consent) return null;
    await tx.delete(pilotDailyActivity).where(eq(pilotDailyActivity.personId, personId));
    const [withdrawn] = await tx.update(pilotMeasurementConsent).set({ status: "withdrawn", withdrawnAt: now, decisionAt: now })
      .where(eq(pilotMeasurementConsent.personId, personId)).returning();
    return withdrawn;
  });
}

export async function cleanupPilotActivity(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db.delete(pilotDailyActivity).where(lt(pilotDailyActivity.activityDate, cutoff))
    .returning({ personId: pilotDailyActivity.personId });
  return rows.length;
}
