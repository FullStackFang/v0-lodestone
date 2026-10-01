import { createHash } from "node:crypto";
import type { Db } from "@/db/client";
import { pilotInvitation, pilotMembership, type PilotMemberKind } from "@/db/pilot-schema";
import { eq } from "drizzle-orm";

export async function enrollTestMember(db: Db, personId: string, memberKind: PilotMemberKind = "test") {
  const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
  const tokenHash = createHash("sha256").update(`test-membership:${personId}`).digest("hex");
  const [invitation] = await db.insert(pilotInvitation).values({
    email: `${personId}@fixture.invalid`,
    tokenHash,
    noticeVersion: "test-participation-v1",
    memberKind,
    status: "accepted",
    expiresAt: new Date("2099-01-08T00:00:00.000Z"),
    acceptedAt,
    acceptedPersonId: personId,
    deliveryStatus: "sent",
    deliveryAttemptedAt: acceptedAt,
    createdAt: acceptedAt,
  }).onConflictDoNothing({ target: pilotInvitation.tokenHash }).returning();
  const current = invitation ?? (await db.select().from(pilotInvitation)
    .where(eq(pilotInvitation.tokenHash, tokenHash)).limit(1))[0];
  await db.insert(pilotMembership).values({
    personId,
    invitationId: current.id,
    status: "active",
    memberKind,
    noticeVersion: current.noticeVersion,
    acceptedAt,
    updatedAt: acceptedAt,
  }).onConflictDoUpdate({
    target: pilotMembership.personId,
    set: { status: "active", revokedAt: null, updatedAt: acceptedAt },
  });
}
