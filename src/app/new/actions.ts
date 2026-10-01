"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/session";
import { createResearchIdea } from "@/resources/service";
import { executeRefreshRun, startOwnerRefreshRun } from "@/resources/refresh-runs";
import type { ResourceFormState } from "../resources/ResourceForm";
import { z } from "zod";

export async function startResearch(_state: ResourceFormState, data: FormData): Promise<ResourceFormState> {
  const db = await getDb();
  const sessionId = await requireSession(db);
  let saved;
  try {
    saved = await createResearchIdea(db, sessionId, {
      idea: String(data.get("idea") ?? ""), title: String(data.get("title") ?? ""), criteria: String(data.get("criteria") ?? ""),
    });
  } catch (error) {
    return { error: error instanceof z.ZodError ? "Describe your idea, unresolved need, and what progress would look like." : error instanceof Error ? error.message : "Your idea could not be saved." };
  }
  let refreshFailed = false;
  try {
    const handle = await startOwnerRefreshRun(db, saved.need.personId);
    await executeRefreshRun(db, handle);
  } catch {
    refreshFailed = true;
  }
  revalidatePath("/ideas");
  revalidatePath("/resources");
  redirect(`/resources?card=${saved.card.id}${refreshFailed ? "&refresh=failed" : ""}`);
}
