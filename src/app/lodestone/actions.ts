"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { embed } from "@/harness/embed";
import { requirePerson } from "@/lib/session";
import { importCard, setVisibility } from "@/lodestone/cards";
import { defaultSearchDeps, searchCard } from "@/lodestone/search";
import type { ActionState } from "@/review/ActionForm";
import { IDEA_ID } from "@/app/api/lodestone/client";

const read = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function describe(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(". ");
  if (error instanceof SyntaxError) return "That file is not JSON.";
  return error instanceof Error ? error.message : "The change could not be saved.";
}

/** Import a `forge-idea` export. The file is read whole, parsed, projected
 *  into the ledger under the signed-in person, and embedded; its changed
 *  blocks are searched once the response is sent. */
export async function importForgeCard(_previous: ActionState, data: FormData): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const file = data.get("file");
    const text = file instanceof File ? await file.text() : read(data, "json");
    if (!text.trim()) throw new Error("Choose a Forge export file.");
    const doc: unknown = JSON.parse(text);
    const out = await importCard(db, { id: person.id, email: person.email }, doc, embed);
    after(() => searchCard(db, out.card.ideaId, defaultSearchDeps(embed)));
    revalidatePath("/lodestone");
    revalidatePath(`/lodestone/cards/${out.card.ideaId}`);
    const filed = `${out.report.written} filed, ${out.report.superseded} superseded, ${out.embedded} embedded`;
    return {
      message: `${out.created ? "Imported" : "Updated"} “${out.card.title}” · ${filed}.`,
      href: `/lodestone/cards/${out.card.ideaId}`,
    };
  } catch (error) {
    return { error: describe(error) };
  }
}

export async function setCardVisibility(_previous: ActionState, data: FormData): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const ideaId = IDEA_ID.parse(read(data, "ideaId"));
    const visibility = z.enum(["private", "cohort"]).parse(read(data, "visibility"));
    const card = await setVisibility(db, person.id, ideaId, visibility);
    revalidatePath("/lodestone");
    revalidatePath(`/lodestone/cards/${ideaId}`);
    revalidatePath("/lodestone/map");
    return { message: card.visibility === "cohort" ? `Published to the cohort.` : `Kept private. Nothing is visible to anyone else.` };
  } catch (error) {
    return { error: describe(error) };
  }
}
