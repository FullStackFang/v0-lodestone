/** The roster's invite and renew: the invitation row, then one email with
 *  the accept link, then the delivery recorded on the row. The membership
 *  rules live in `membership.ts`; this is only the mail around them. */
import type { Db } from "@/db/client";
import { deliverEmail, type EmailDelivery } from "@/auth/delivery";
import { createInvitation, recordInvitationDelivery, renewInvitation, type VerifiedPilotActor } from "./membership";

export const NOTICE_VERSION = "lodestone-pilot-v1";
const INVITATION_DAYS = 14;

/** Where an emailed link points: the public origin, or the dev server. */
export function appOrigin(): string {
  return (process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

export function joinUrl(token: string, origin = appOrigin()): string {
  return `${origin}/lodestone/join/${token}`;
}

interface InviteOptions {
  now?: Date;
  deliver?: EmailDelivery;
  origin?: string;
}

async function send(db: Db, invitation: { id: string; email: string; expiresAt: Date }, token: string, options: InviteOptions) {
  const url = joinUrl(token, options.origin);
  let failure: unknown = null;
  try {
    await (options.deliver ?? deliverEmail)({
      email: invitation.email,
      subject: "You're invited to the Lodestone cohort",
      text: `You've been invited to join this cohort on Lodestone, where members publish their idea cards to each other and see the prior art the network finds for them.\n\nAccept by signing in with this address: ${url}\n\nThe link works until ${invitation.expiresAt.toISOString().slice(0, 10)}.`,
    });
  } catch (error) {
    failure = error;
  }
  await recordInvitationDelivery(db, invitation.id, failure, options.now);
  return { invitationId: invitation.id, email: invitation.email, url, delivered: failure === null };
}

const expiry = (now: Date) => new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

/** Invite an address: a fourteen-day invitation and one email. A failed
 *  delivery keeps the invitation and says so on the roster. */
export async function inviteMember(db: Db, actor: VerifiedPilotActor, email: string, options: InviteOptions = {}) {
  const now = options.now ?? new Date();
  const { invitation, token } = await createInvitation(db, actor, { email, noticeVersion: NOTICE_VERSION, expiresAt: expiry(now) }, { now });
  return send(db, invitation, token, { ...options, now });
}

/** Replace an address's pending invitation with a fresh fourteen days and
 *  send the new link. */
export async function renewMember(db: Db, actor: VerifiedPilotActor, email: string, options: InviteOptions = {}) {
  const now = options.now ?? new Date();
  const { invitation, token } = await renewInvitation(db, actor, { email, noticeVersion: NOTICE_VERSION, expiresAt: expiry(now) }, { now });
  return send(db, invitation, token, { ...options, now });
}
