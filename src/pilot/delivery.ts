import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { EmailDelivery, EmailMessage } from "@/auth/delivery";
import { deliverEmail } from "@/auth/delivery";
import type { Db } from "@/db/client";
import { pilotInvitation } from "@/db/pilot-schema";
import { assertPilotOperator, type VerifiedPilotActor } from "./membership";

export type PilotInvitationMessage = EmailMessage;

function deliveryOrigin(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Pilot origin must be an origin without credentials or a path.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Pilot origin must use HTTPS.");
  }
  return url.origin;
}

export async function deliverPilotInvitation(
  db: Db,
  actor: VerifiedPilotActor,
  created: { invitation: { id: string }; token: string },
  origin: string,
  delivery: EmailDelivery = deliverEmail,
  now = new Date(),
) {
  await assertPilotOperator(actor);
  const [invitation] = await db.select().from(pilotInvitation).where(and(
    eq(pilotInvitation.id, created.invitation.id),
    eq(pilotInvitation.status, "pending"),
  )).limit(1);
  const tokenHash = createHash("sha256").update(created.token).digest("hex");
  if (!invitation || invitation.tokenHash !== tokenHash) throw new Error("Pending invitation unavailable.");
  const invitationUrl = new URL("/pilot/accept", deliveryOrigin(origin));
  invitationUrl.searchParams.set("token", created.token);
  const message: PilotInvitationMessage = {
    email: invitation.email,
    subject: "Your Thesis Forge pilot invitation",
    text: `You are invited to the Thesis Forge pilot. Review and accept the participation notice here:\n\n${invitationUrl.href}\n\nThis invitation expires ${invitation.expiresAt.toISOString()}.`,
  };
  try {
    await delivery(message);
    const [updated] = await db.update(pilotInvitation).set({
      deliveryStatus: "sent", deliveryAttemptedAt: now, deliveryErrorCode: null,
    }).where(eq(pilotInvitation.id, invitation.id)).returning();
    return updated;
  } catch {
    const [updated] = await db.update(pilotInvitation).set({
      deliveryStatus: "failed", deliveryAttemptedAt: now, deliveryErrorCode: "delivery_failed",
    }).where(eq(pilotInvitation.id, invitation.id)).returning();
    return updated;
  }
}

