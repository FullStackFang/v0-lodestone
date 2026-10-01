"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { deliverPilotInvitation } from "@/pilot/delivery";
import {
  createInvitation,
  renewInvitation,
  revokeInvitation,
  revokeMembership,
} from "@/pilot/membership";
import type { PilotActionState } from "./PilotActionForm";
import { claimManualGlobalRun, executeRefreshRun, retryGlobalRefreshRun } from "@/resources/refresh-runs";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

async function operatorContext() {
  const db = await getDb();
  const person = await requirePerson(db);
  return { db, actor: { personId: person.id, email: person.email, emailVerified: true } };
}

async function run(operation: () => Promise<string>): Promise<PilotActionState> {
  try {
    const message = await operation();
    revalidatePath("/pilot/operator");
    return { message };
  } catch (error) {
    return {
      error: error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error ? error.message : "The pilot roster could not be updated.",
    };
  }
}

function invitationInput(form: FormData, now: Date) {
  return {
    email: field(form, "email"),
    noticeVersion: field(form, "noticeVersion"),
    memberKind: z.enum(["participant", "operator", "test"]).parse(field(form, "memberKind") || "participant"),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
}

async function createAndDeliver(form: FormData, renew: boolean) {
  const { db, actor } = await operatorContext();
  const now = new Date();
  const created = renew
    ? await renewInvitation(db, actor, invitationInput(form, now), { now })
    : await createInvitation(db, actor, invitationInput(form, now), { now });
  const delivered = await deliverPilotInvitation(
    db,
    actor,
    created,
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
    undefined,
    now,
  );
  return delivered.deliveryStatus === "sent"
    ? "Invitation created and sent."
    : "Invitation created, but delivery failed. Renew and resend when delivery is available.";
}

export async function createAndSendInvitation(_state: PilotActionState, form: FormData) {
  return run(() => createAndDeliver(form, false));
}

export async function renewAndSendInvitation(_state: PilotActionState, form: FormData) {
  return run(() => createAndDeliver(form, true));
}

export async function revokePilotInvitation(_state: PilotActionState, form: FormData) {
  return run(async () => {
    const { db, actor } = await operatorContext();
    await revokeInvitation(db, actor, field(form, "invitationId"));
    return "Invitation revoked.";
  });
}

export async function revokePilotMember(_state: PilotActionState, form: FormData) {
  return run(async () => {
    const { db, actor } = await operatorContext();
    await revokeMembership(db, actor, field(form, "personId"));
    return "Membership revoked and sharing withdrawn.";
  });
}

export async function runGlobalRefresh() {
  return run(async () => {
    const { db, actor } = await operatorContext();
    const claim = await claimManualGlobalRun(db, actor);
    if (claim.kind === "busy") return "A global refresh is already running.";
    const result = await executeRefreshRun(db, claim.handle);
    return `Global refresh complete: ${result.checked} needs checked.`;
  });
}

export async function retryGlobalRefresh(_state: PilotActionState, form: FormData) {
  return run(async () => {
    const { db, actor } = await operatorContext();
    const claim = await retryGlobalRefreshRun(db, actor, field(form, "runId"));
    if (claim.kind === "busy") return "A global refresh is already running.";
    if (claim.kind === "replayed") return "That scheduled slot already succeeded.";
    const result = await executeRefreshRun(db, claim.handle);
    return `Scheduled refresh recovered: ${result.checked} needs checked.`;
  });
}
