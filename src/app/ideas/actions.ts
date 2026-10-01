"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type Db } from "@/db/client";
import { fieldsOf } from "@/db/cards";
import { requirePerson } from "@/lib/session";
import type { ActionState } from "@/review/ActionForm";
import { groupPatch } from "@/review/editor";
import { createExperiment, ownedIdea, publishRevision, respondToReview, revokeRevision, saveIdea, updateExperiment } from "@/review/revisions";

const read = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
async function run(data: FormData, operation: (db: Db, personId: string, cardId: string) => Promise<ActionState>): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const cardId = z.uuid().parse(read(data, "cardId"));
    const card = await ownedIdea(db, person.id, cardId);
    const state = await operation(db, person.id, cardId);
    revalidatePath(`/ideas/${cardId}`);
    revalidatePath("/ideas");
    revalidatePath(`/c/${card.slug}`);
    revalidatePath("/library");
    return state;
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(". ") : error instanceof Error ? error.message : "The change could not be saved." };
  }
}

export async function saveGroup(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId, cardId) => {
    const card = await ownedIdea(db, personId, cardId);
    await saveIdea(db, personId, cardId, groupPatch(fieldsOf(card), read(data, "group"), data));
    return { message: "Draft saved." };
  });
}

export async function publish(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId, cardId) => {
    if (data.get("confirmed") !== "on") throw new Error("Confirm the preview before publishing.");
    const revision = await publishRevision(db, personId, cardId, read(data, "visibility"), read(data, "preview"));
    const card = await ownedIdea(db, personId, cardId);
    return { message: `Revision ${revision.version} published.`, href: `/c/${card.slug}?v=${revision.version}` };
  });
}

export async function revoke(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId) => {
    await revokeRevision(db, personId, z.uuid().parse(read(data, "revisionId")));
    return { message: "Revision access revoked." };
  });
}

export async function respond(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId) => {
    await respondToReview(db, personId, z.uuid().parse(read(data, "reviewId")), { disposition: read(data, "disposition"), response: read(data, "response") });
    return { message: "Response recorded." };
  });
}

export async function planExperiment(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId, cardId) => {
    await createExperiment(db, personId, cardId, { hypothesis: read(data, "hypothesis"), method: read(data, "method"), criterion: read(data, "criterion"), revisionId: read(data, "revisionId") || null });
    return { message: "Experiment planned." };
  });
}

export async function saveExperiment(_previous: ActionState, data: FormData) {
  return run(data, async (db, personId) => {
    await updateExperiment(db, personId, z.uuid().parse(read(data, "experimentId")), { status: read(data, "status"), result: read(data, "result") || null, evidenceType: read(data, "evidenceType") || null, shareResult: data.get("shareResult") === "on" });
    return { message: "Experiment updated." };
  });
}
