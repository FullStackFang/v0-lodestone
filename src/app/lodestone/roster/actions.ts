"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { revokeInvitation, revokeMembership, type VerifiedPilotActor } from "@/pilot/membership";
import { inviteMember, renewMember } from "@/pilot/roster";
import type { ActionState } from "@/review/ActionForm";

const read = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const describe = (error: unknown) => (error instanceof Error ? error.message : "The change could not be saved.");

/** The signed-in person as a membership actor. Only a verified session
 *  reaches `requirePerson`, and every action checks the operator predicate. */
async function operator() {
  const db = await getDb();
  const person = await requirePerson(db);
  const actor: VerifiedPilotActor = { personId: person.id, email: person.email, emailVerified: true };
  return { db, actor };
}

const sentLine = (out: { email: string; delivered: boolean }, verb: string) =>
  out.delivered ? `${verb} ${out.email}; the link is in their inbox.` : `${verb} ${out.email}, but the email did not go. Renew to send it again.`;

export async function invite(_previous: ActionState, data: FormData): Promise<ActionState> {
  const { db, actor } = await operator();
  try {
    const out = await inviteMember(db, actor, z.string().trim().email("That is not an email address.").parse(read(data, "email")));
    revalidatePath("/lodestone/roster");
    return { message: sentLine(out, "Invited") };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : describe(error) };
  }
}

export async function renew(_previous: ActionState, data: FormData): Promise<ActionState> {
  const { db, actor } = await operator();
  try {
    const out = await renewMember(db, actor, read(data, "email"));
    revalidatePath("/lodestone/roster");
    return { message: sentLine(out, "Renewed for") };
  } catch (error) {
    return { error: describe(error) };
  }
}

/** Revoke a member (their cards leave every list) or a pending invitation. */
export async function revoke(_previous: ActionState, data: FormData): Promise<ActionState> {
  const { db, actor } = await operator();
  try {
    const personId = read(data, "personId");
    if (personId) await revokeMembership(db, actor, personId);
    else await revokeInvitation(db, actor, read(data, "invitationId"));
    revalidatePath("/lodestone/roster");
    return { message: personId ? "Revoked. Their cards have left the cohort's lists." : "Invitation revoked; its link no longer works." };
  } catch (error) {
    return { error: describe(error) };
  }
}
