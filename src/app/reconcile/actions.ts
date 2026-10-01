"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { resolveConflict } from "@/harness/papers/reconcile";

export async function resolve(formData: FormData): Promise<void> {
  const db = await getDb();
  await requireCurator(db);
  const id = String(formData.get("id") ?? "");
  const keep = String(formData.get("keep") ?? "");
  if (!id || (keep !== "human" && keep !== "model")) return;
  await resolveConflict(db, id, keep);
  revalidatePath("/reconcile");
}
