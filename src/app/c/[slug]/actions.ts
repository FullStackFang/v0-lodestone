"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import type { ActionState } from "@/review/ActionForm";
import { addReview } from "@/review/revisions";

export async function submitReview(_previous: ActionState, data: FormData): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const revisionId = z.uuid().parse(data.get("revisionId"));
    await addReview(db, person.id, revisionId, { component: data.get("component"), kind: data.get("kind"), text: data.get("text") });
    revalidatePath("/c/[slug]", "page");
    revalidatePath("/ideas/[id]", "page");
    return { message: "Review recorded on this revision." };
  } catch (error) {
    return { error: error instanceof z.ZodError ? "Choose a component and review kind, and add a review of up to 12,000 characters." : error instanceof Error ? error.message : "The review could not be saved." };
  }
}
