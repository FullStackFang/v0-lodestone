"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { removeReference, saveReference } from "@/library/library";
import type { ActionState } from "@/review/ActionForm";
import { z } from "zod";

export async function saveComponent(_previous: ActionState, form: FormData): Promise<ActionState> {
  const db = await getDb();
  const actor = await requirePerson(db);
  try {
    await saveReference(db, actor.id, { cardId: form.get("cardId"), revisionId: form.get("revisionId"), component: form.get("component"), note: form.get("note") ?? "" });
    revalidatePath("/library");
    revalidatePath("/library/saved");
    return { message: "Reference saved." };
  } catch (error) {
    return { error: error instanceof z.ZodError ? "Choose a valid idea and published component." : error instanceof Error ? error.message : "The reference could not be saved. Please try again." };
  }
}
export async function unsaveComponent(_previous: ActionState, form: FormData): Promise<ActionState> {
  const db = await getDb();
  const actor = await requirePerson(db);
  try {
    await removeReference(db, actor.id, String(form.get("id") ?? ""));
    revalidatePath("/library");
    revalidatePath("/library/saved");
    return { message: "Reference removed." };
  } catch (error) {
    return { error: error instanceof z.ZodError ? "Choose a valid saved reference." : error instanceof Error ? error.message : "The reference could not be removed. Please try again." };
  }
}
