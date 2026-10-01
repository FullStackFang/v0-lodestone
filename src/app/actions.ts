"use server";

/** The three doors. Each creates a card and sends the founder to its thread.
 *  `blank` costs nothing — no model call, no event; the thread opens on the
 *  fixed line. `deck` and `resume` store the material as a `document` and
 *  hand it to the thread as the first message, which the thread posts as
 *  soon as it mounts, so the founder watches the first turn happen rather
 *  than waiting on a form. */
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { createCard, createDocument } from "@/db/cards";
import { ingestDocument } from "@/harness/founder/documents";
import { requireSession } from "@/lib/session";
import { assertActiveSessionMember } from "@/pilot/membership";

const MAX_MATERIAL_CHARS = 60_000;

export async function startBlank(): Promise<void> {
  const db = await getDb();
  const sessionId = await requireSession(db);
  await assertActiveSessionMember(db, sessionId);
  const card = await createCard(db, { sessionId, door: "blank" });
  redirect(`/t/${card.id}`);
}

export async function startWithMaterial(formData: FormData): Promise<void> {
  const door = formData.get("door");
  if (door !== "deck" && door !== "resume") throw new Error("unknown door");

  let text = String(formData.get("text") ?? "").trim();
  let title: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      throw new Error("Only .txt and .md for now; PDF arrives with ingestion.");
    }
    text = (await file.text()).trim();
    title = file.name;
  }
  if (!text) throw new Error("Paste the text or choose a file.");
  if (text.length > MAX_MATERIAL_CHARS) text = text.slice(0, MAX_MATERIAL_CHARS);

  const db = await getDb();
  const sessionId = await requireSession(db);
  await assertActiveSessionMember(db, sessionId);
  const docId = await createDocument(db, { sessionId, source: door, title, text });
  const card = await createCard(db, { sessionId, door, docId });
  // The founder goes to their thread now; the deck is read behind them.
  after(() => ingestDocument(db, docId, card.id));
  redirect(`/t/${card.id}`);
}
