import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { founderIntroductions, founderPreferences } from "@/db/matching-schema";
import {
  pilotInvitation,
  pilotMembership,
  type PilotInvitation,
  type PilotMemberKind,
  type PilotMembership,
} from "@/db/pilot-schema";
import { cardRevision } from "@/db/review-schema";
import { person, session } from "@/db/schema";

export type VerifiedPilotActor = {
  personId: string;
  email: string;
  emailVerified: boolean;
};

const Actor = z.object({
  personId: z.uuid(),
  email: z.string().trim().email(),
  emailVerified: z.boolean(),
}).strict();

const InvitationInput = z.object({
  email: z.string().trim().email(),
  noticeVersion: z.string().trim().min(1).max(100),
  expiresAt: z.date(),
  memberKind: z.enum(["participant", "operator", "test"]).default("participant"),
}).strict();

type InvitationInput = z.input<typeof InvitationInput>;
type InvitationOptions = { now?: Date; token?: string };

export function normalizePilotEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function isPilotOperatorEmail(email: string) {
  const allowed = (process.env.PILOT_OPERATOR_EMAILS ?? "")
    .split(",")
    .map(normalizePilotEmail)
    .filter(Boolean);
  return allowed.includes(normalizePilotEmail(email));
}

export async function assertPilotOperator(actor: VerifiedPilotActor) {
  const value = Actor.parse(actor);
  if (!value.emailVerified || !isPilotOperatorEmail(value.email)) {
    throw new Error("Pilot operator access required.");
  }
  return actor;
}

function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationValues(input: InvitationInput, options: InvitationOptions) {
  const value = InvitationInput.parse(input);
  const now = options.now ?? new Date();
  if (value.expiresAt <= now) throw new Error("Invitation expiry must be in the future.");
  const token = options.token ?? randomBytes(32).toString("base64url");
  return {
    token,
    row: {
      email: normalizePilotEmail(value.email),
      tokenHash: invitationTokenHash(token),
      noticeVersion: value.noticeVersion,
      memberKind: value.memberKind,
      expiresAt: value.expiresAt,
      createdAt: now,
    },
  };
}

async function insertInvitation(db: Db, input: InvitationInput, options: InvitationOptions) {
  const values = invitationValues(input, options);
  const [invitation] = await db.insert(pilotInvitation).values(values.row).returning();
  return { invitation, token: values.token };
}

export async function createInvitation(
  db: Db,
  actor: VerifiedPilotActor,
  input: InvitationInput,
  options: InvitationOptions = {},
): Promise<{ invitation: PilotInvitation; token: string }> {
  await assertPilotOperator(actor);
  const email = normalizePilotEmail(input.email);
  return db.transaction(async (tx) => {
    const [pending] = await tx.select({ id: pilotInvitation.id }).from(pilotInvitation)
      .where(and(eq(pilotInvitation.email, email), eq(pilotInvitation.status, "pending"))).for("update");
    if (pending) throw new Error("A current invitation already exists; renew it instead.");
    return insertInvitation(tx as unknown as Db, input, options);
  });
}

export async function renewInvitation(
  db: Db,
  actor: VerifiedPilotActor,
  input: InvitationInput,
  options: InvitationOptions = {},
) {
  await assertPilotOperator(actor);
  const email = normalizePilotEmail(input.email);
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.select({ id: pilotInvitation.id }).from(pilotInvitation)
      .where(and(eq(pilotInvitation.email, email), eq(pilotInvitation.status, "pending"))).for("update");
    await tx.update(pilotInvitation).set({ status: "revoked", revokedAt: now })
      .where(and(eq(pilotInvitation.email, email), eq(pilotInvitation.status, "pending")));
    return insertInvitation(tx as unknown as Db, input, { ...options, now });
  });
}

export async function revokeInvitation(db: Db, actor: VerifiedPilotActor, invitationId: string, now = new Date()) {
  await assertPilotOperator(actor);
  const [row] = await db.update(pilotInvitation).set({ status: "revoked", revokedAt: now })
    .where(and(eq(pilotInvitation.id, z.uuid().parse(invitationId)), eq(pilotInvitation.status, "pending"))).returning();
  if (!row) throw new Error("Pending invitation unavailable.");
  return row;
}

export async function membershipFor(db: Db, personId: string) {
  const [membership] = await db.select().from(pilotMembership)
    .where(eq(pilotMembership.personId, z.uuid().parse(personId))).limit(1);
  return membership ?? null;
}

export async function isActiveMember(db: Db, personId: string) {
  const membership = await membershipFor(db, personId);
  return membership?.status === "active" && membership.revokedAt === null;
}

export async function isActiveSessionMember(db: Db, sessionId: string) {
  const [membership] = await db.select({ personId: pilotMembership.personId }).from(session)
    .innerJoin(pilotMembership, and(
      eq(pilotMembership.personId, session.personId),
      eq(pilotMembership.status, "active"),
      isNull(pilotMembership.revokedAt),
    ))
    .where(eq(session.id, z.uuid().parse(sessionId))).limit(1);
  return Boolean(membership);
}

export async function assertActiveSessionMember(db: Db, sessionId: string) {
  if (!(await isActiveSessionMember(db, sessionId))) {
    throw new Error("Active pilot membership required.");
  }
}

export async function assertActiveMember(db: Db, personId: string) {
  const membership = await membershipFor(db, personId);
  if (!membership || membership.status !== "active" || membership.revokedAt !== null) {
    throw new Error("Active pilot membership required.");
  }
  return membership;
}

export async function lockActiveMembership(db: Db, personId: string) {
  const [membership] = await db.select().from(pilotMembership)
    .where(eq(pilotMembership.personId, z.uuid().parse(personId))).for("update");
  if (!membership || membership.status !== "active" || membership.revokedAt !== null) {
    throw new Error("Active pilot membership required.");
  }
  return membership;
}

export async function invitationAcceptanceState(
  db: Db,
  actor: VerifiedPilotActor,
  token: string,
  now = new Date(),
): Promise<
  | { status: "unavailable" | "unverified" | "wrong_email" | "expired" | "accepted" | "reenrollment_required" }
  | { status: "ready"; noticeVersion: string; expiresAt: Date }
> {
  const value = Actor.safeParse(actor);
  if (!value.success || !value.data.emailVerified) return { status: "unverified" };
  if (!token) return { status: "unavailable" };
  const [invitation] = await db.select({
    id: pilotInvitation.id,
    email: pilotInvitation.email,
    noticeVersion: pilotInvitation.noticeVersion,
    status: pilotInvitation.status,
    expiresAt: pilotInvitation.expiresAt,
    acceptedPersonId: pilotInvitation.acceptedPersonId,
  }).from(pilotInvitation).where(eq(pilotInvitation.tokenHash, invitationTokenHash(token))).limit(1);
  if (!invitation || invitation.status === "revoked") return { status: "unavailable" };
  if (invitation.email !== normalizePilotEmail(value.data.email)) return { status: "wrong_email" };
  if (invitation.status === "pending") {
    if (now >= invitation.expiresAt) return { status: "expired" };
    return { status: "ready", noticeVersion: invitation.noticeVersion, expiresAt: invitation.expiresAt };
  }
  const membership = await membershipFor(db, value.data.personId);
  return invitation.acceptedPersonId === value.data.personId && membership?.status === "active" &&
    membership.invitationId === invitation.id
    ? { status: "accepted" }
    : { status: "reenrollment_required" };
}

export async function listPilotRoster(db: Db, actor: VerifiedPilotActor) {
  await assertPilotOperator(actor);
  const [invitations, memberships] = await Promise.all([
    db.select({
      id: pilotInvitation.id,
      email: pilotInvitation.email,
      noticeVersion: pilotInvitation.noticeVersion,
      memberKind: pilotInvitation.memberKind,
      status: pilotInvitation.status,
      expiresAt: pilotInvitation.expiresAt,
      deliveryStatus: pilotInvitation.deliveryStatus,
      deliveryAttemptedAt: pilotInvitation.deliveryAttemptedAt,
      deliveryErrorCode: pilotInvitation.deliveryErrorCode,
      createdAt: pilotInvitation.createdAt,
    }).from(pilotInvitation).orderBy(desc(pilotInvitation.createdAt)),
    db.select({
      personId: pilotMembership.personId,
      name: person.name,
      email: person.email,
      status: pilotMembership.status,
      memberKind: pilotMembership.memberKind,
      noticeVersion: pilotMembership.noticeVersion,
      acceptedAt: pilotMembership.acceptedAt,
      revokedAt: pilotMembership.revokedAt,
    }).from(pilotMembership).innerJoin(person, eq(pilotMembership.personId, person.id))
      .orderBy(desc(pilotMembership.updatedAt)),
  ]);
  return { invitations, memberships };
}

export async function acceptInvitation(
  db: Db,
  actor: VerifiedPilotActor,
  token: string,
  now = new Date(),
): Promise<PilotMembership> {
  const value = Actor.parse(actor);
  if (!value.emailVerified) throw new Error("A verified email is required.");
  const hash = invitationTokenHash(z.string().min(1).parse(token));
  return db.transaction(async (tx) => {
    const [invitation] = await tx.select().from(pilotInvitation)
      .where(eq(pilotInvitation.tokenHash, hash)).for("update");
    if (!invitation) throw new Error("Invitation unavailable.");
    if (invitation.email !== normalizePilotEmail(value.email)) throw new Error("Invitation email does not match.");

    const [identity] = await tx.select({ email: person.email }).from(person)
      .where(eq(person.id, value.personId)).limit(1);
    if (!identity || normalizePilotEmail(identity.email) !== invitation.email) {
      throw new Error("Invitation email does not match the verified identity.");
    }

    if (invitation.status === "accepted") {
      const [existing] = await tx.select().from(pilotMembership)
        .where(eq(pilotMembership.personId, value.personId)).for("update");
      if (invitation.acceptedPersonId === value.personId && existing?.status === "active" &&
        existing.invitationId === invitation.id) return existing;
      throw new Error("A new invitation is required to enroll again.");
    }
    if (invitation.status === "revoked") throw new Error("Invitation has been revoked.");
    if (now >= invitation.expiresAt) throw new Error("Invitation has expired.");

    await tx.select({ personId: pilotMembership.personId }).from(pilotMembership)
      .where(eq(pilotMembership.personId, value.personId)).for("update");
    const [accepted] = await tx.update(pilotInvitation).set({
      status: "accepted", acceptedAt: now, acceptedPersonId: value.personId,
    }).where(and(eq(pilotInvitation.id, invitation.id), eq(pilotInvitation.status, "pending"))).returning();
    if (!accepted) throw new Error("Invitation was accepted by another request.");

    const [membership] = await tx.insert(pilotMembership).values({
      personId: value.personId,
      invitationId: invitation.id,
      status: "active",
      memberKind: invitation.memberKind,
      noticeVersion: invitation.noticeVersion,
      acceptedAt: now,
      revokedAt: null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: pilotMembership.personId,
      set: {
        invitationId: invitation.id,
        status: "active",
        memberKind: invitation.memberKind,
        noticeVersion: invitation.noticeVersion,
        acceptedAt: now,
        revokedAt: null,
        updatedAt: now,
      },
    }).returning();
    return membership;
  });
}

export async function cancelPendingIntroductions(
  db: Db,
  personId: string,
  reason: string,
  now = new Date(),
) {
  return db.update(founderIntroductions).set({
    status: "cancelled",
    cancelledAt: now,
    cancellationReason: z.string().trim().min(1).max(100).parse(reason),
  }).where(and(
    eq(founderIntroductions.status, "pending"),
    or(eq(founderIntroductions.requesterId, personId), eq(founderIntroductions.recipientId, personId)),
  )).returning();
}

export async function revokeMembership(
  db: Db,
  actor: VerifiedPilotActor,
  personId: string,
  now = new Date(),
) {
  await assertPilotOperator(actor);
  const targetId = z.uuid().parse(personId);
  return db.transaction(async (tx) => {
    const [membership] = await tx.select().from(pilotMembership)
      .where(eq(pilotMembership.personId, targetId)).for("update");
    if (!membership) throw new Error("Pilot membership unavailable.");
    if (membership.status === "revoked") return membership;
    const [updated] = await tx.update(pilotMembership).set({
      status: "revoked", revokedAt: now, updatedAt: now,
    }).where(and(eq(pilotMembership.personId, targetId), eq(pilotMembership.status, "active"))).returning();
    await tx.update(founderPreferences).set({ discoverable: false, updatedAt: now })
      .where(eq(founderPreferences.personId, targetId));
    await tx.update(cardRevision).set({ revokedAt: now })
      .where(and(eq(cardRevision.ownerId, targetId), eq(cardRevision.visibility, "cohort"), isNull(cardRevision.revokedAt)));
    await cancelPendingIntroductions(tx as unknown as Db, targetId, "membership_revoked", now);
    return updated;
  });
}
