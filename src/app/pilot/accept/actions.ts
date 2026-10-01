"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { safeReturnPath } from "@/auth/return-path";
import { requirePerson } from "@/lib/session";
import { acceptInvitation } from "@/pilot/membership";

export type AcceptanceActionState = { error?: string };

export async function acceptPilotInvitation(
  _previous: AcceptanceActionState,
  form: FormData,
): Promise<AcceptanceActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  if (form.get("acceptedNotice") !== "on") return { error: "Accept the participation notice to join." };
  try {
    await acceptInvitation(db, {
      personId: person.id,
      email: person.email,
      emailVerified: true,
    }, String(form.get("token") ?? ""));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invitation could not be accepted." };
  }
  redirect(safeReturnPath(form.get("next")));
}

