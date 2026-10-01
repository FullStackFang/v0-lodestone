"use server";

/** What the reading view can ask the server to do.
 *
 * The client sends offsets and the string it believes it selected; the
 * server slices the canonical text itself and refuses the save unless the
 * two agree. The client never decides the quote. */
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { SliceMismatch, UnknownTag, deleteAnnotation, saveAnnotation } from "@/harness/papers/annotate";
import { computeSessionCards } from "@/harness/papers/cards";
import { endSession } from "@/harness/papers/session";
import type { Facet } from "@/harness/schema";

export interface SavedHighlight {
  id: string;
  start: number;
  end: number;
  tag: string;
  subtype: string | null;
  note: string | null;
  assertionId: string | null;
}

export type SaveResult = { ok: true; annotation: SavedHighlight } | { ok: false; error: string };

export async function saveHighlight(input: {
  sessionId: string;
  start: number;
  end: number;
  selected: string;
  tag: string;
  subtype: string | null;
  note: string | null;
}): Promise<SaveResult> {
  try {
    const db = await getDb();
    await requireCurator(db);
    const { annotation, assertionId } = await saveAnnotation(db, input);
    return {
      ok: true,
      annotation: {
        id: annotation.id,
        start: annotation.startOff,
        end: annotation.endOff,
        tag: annotation.tag,
        subtype: annotation.mechanismSubtype,
        note: annotation.note,
        assertionId,
      },
    };
  } catch (err) {
    if (err instanceof SliceMismatch) {
      return { ok: false, error: "The text moved under the selection — reload and highlight again." };
    }
    if (err instanceof UnknownTag) return { ok: false, error: "That tag has no row in the map." };
    return { ok: false, error: err instanceof Error ? err.message : "The save did not complete." };
  }
}

export async function removeHighlight(annotationId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    await requireCurator(db);
    await deleteAnnotation(db, annotationId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The delete did not complete." };
  }
}

/**
 * End the sitting and go to what it produced.
 *
 * The form posts to this directly rather than through a client callback:
 * `redirect` belongs to the action's own response, and a callback that
 * merely *calls* an action swallows it, leaving the reader on the page they
 * just finished.
 */
export async function finishSession(formData: FormData): Promise<void> {
  const db = await getDb();
  await requireCurator(db);
  const artifactId = String(formData.get("artifactId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!artifactId || !sessionId) return;
  const absent = formData.getAll("absent").map(String) as Facet[];

  const result = await endSession(db, sessionId, absent);
  // Only a sitting that actually ended here computes cards; a second
  // submit lands on the screen the first one produced.
  if (result.ended) await computeSessionCards(db, sessionId);
  redirect(`/read/${artifactId}/end?session=${sessionId}`);
}
