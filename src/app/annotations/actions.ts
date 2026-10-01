"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { AnnotationReferenced, deleteAnnotation } from "@/harness/papers/annotate";

/** Delete, unless a reconciliation cites it. The refusal names the rows so
 *  the reader can go and resolve them first. */
export async function removeAnnotation(formData: FormData): Promise<void> {
  const db = await getDb();
  await requireCurator(db);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteAnnotation(db, id);
  } catch (err) {
    if (err instanceof AnnotationReferenced) {
      throw new Error(
        `This annotation is part of a reconciliation (${err.reconciliationIds.join(", ")}). Resolve it first.`,
      );
    }
    throw err;
  }
  revalidatePath("/annotations");
}
