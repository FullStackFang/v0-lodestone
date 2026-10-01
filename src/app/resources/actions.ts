"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { createNeed, importResource, markRead, recordOutcome, updateNeed } from "@/resources/service";
import { executeRefreshRun, startOwnerRefreshRun } from "@/resources/refresh-runs";
import { CLAIM_FACETS } from "@/resources/validation";
import type { ResourceFormState } from "./ResourceForm";

const field = (data: FormData, name: string) => String(data.get(name) ?? "");
async function act(operation: () => Promise<string>): Promise<ResourceFormState> {
  try {
    const message = await operation();
    revalidatePath("/resources", "layout");
    return { message };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") : error instanceof Error ? error.message : "The change could not be saved." };
  }
}

export async function saveNeed(_state: ResourceFormState, data: FormData) {
  const db = await getDb();
  const actor = await requirePerson(db);
  return act(async () => {
    const input = { title: field(data, "title"), criteria: field(data, "criteria"), monitoring: data.has("monitoring") };
    const id = field(data, "needId");
    if (id) await updateNeed(db, actor.id, id, { ...input, status: field(data, "status") });
    else await createNeed(db, actor.id, { ...input, cardId: field(data, "cardId") });
    return "Need saved.";
  });
}

export async function refresh(_state: ResourceFormState, _data: FormData) {
  const db = await getDb();
  const actor = await requirePerson(db);
  return act(async () => {
    const handle = await startOwnerRefreshRun(db, actor.id);
    const result = await executeRefreshRun(db, handle);
    return `${result.checked} needs checked. ${result.created} new recommendations.`;
  });
}

export async function outcome(_state: ResourceFormState, data: FormData) {
  const db = await getDb();
  const actor = await requirePerson(db);
  return act(async () => {
    const id = field(data, "recommendationId");
    if (field(data, "outcome") === "read") await markRead(db, actor.id, id);
    else await recordOutcome(db, actor.id, id, field(data, "outcome"), field(data, "note"));
    return "Response saved.";
  });
}

export async function curate(_state: ResourceFormState, data: FormData) {
  const db = await getDb();
  const actor = await requirePerson(db);
  return act(async () => {
    await importResource(db, actor.id, {
      kind: field(data, "kind"), title: field(data, "title"), sourceUrl: field(data, "sourceUrl"),
      identifier: field(data, "identifier"), sourceDate: field(data, "sourceDate"), rawText: field(data, "rawText"),
      claims: CLAIM_FACETS.filter((facet) => field(data, facet).trim()).map((facet) => ({
        facet, text: field(data, facet), quote: field(data, facet), prefix: field(data, `${facet}Prefix`),
      })),
      proposals: field(data, "proposals").split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    });
    return "Resource added to the corpus.";
  });
}
