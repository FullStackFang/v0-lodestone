"use server";

/** The only route to `confirmed`.
 *
 * A model may write `extracted`; a second source earns `repeated`; a
 * classmate's annotation earns `corroborated`. The founder's own edit is
 * the only thing that earns `confirmed`, and the database agrees — the
 * `confirmed_is_human` check refuses any other source type.
 *
 * Nothing here deletes. Removing a row supersedes it with no successor and
 * marks it retracted, so the record of having said it survives.
 */
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assertions } from "@/db/schema";
import { embed } from "@/harness/embed";
import { dismiss, recordFollowUp, requestIntroduction, respondIntroduction } from "@/harness/founder/intro";
import { PreferenceInput, savePreferences } from "@/harness/founder/preferences";
import { query } from "@/harness/founder/queries";
import { rerankAndPersist } from "@/harness/founder/rerank";
import { insertAssertion, supersede } from "@/harness/ledger";
import { requirePerson } from "@/lib/session";
import { assertActiveMember } from "@/pilot/membership";

class NotYours extends Error {}

async function me(active = true) {
  const db = await getDb();
  const person = await requirePerson(db);
  if (active) await assertActiveMember(db, person.id);
  return { db, personId: person.id };
}

/** Idea assertions are edited through their canonical card, never this profile. */
async function mine(db: Awaited<ReturnType<typeof getDb>>, personId: string, assertionId: string) {
  const [row] = await db.select().from(assertions).where(eq(assertions.id, assertionId)).limit(1);
  if (!row) throw new NotYours("no such row");
  if (row.subjectType !== "person" || row.subjectId !== personId) throw new NotYours("not your person row; edit ideas in the idea editor");
  if (row.status !== "active") throw new NotYours("This profile fact has already changed.");
  return row;
}

export async function editAssertion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("An edit needs words.");
  if (text.length > 2000) throw new Error("Keep profile facts under 2,000 characters.");

  const { db, personId } = await me();
  const row = await mine(db, personId, id);
  const embedding = await embed([text]);
  const vector = embedding.vectors[0];

  await supersede(db, row.id, {
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    facet: row.facet,
    abstractionLevel: row.abstractionLevel,
    text,
    sourceType: "subject_edit",
    confidence: "confirmed",
    evidenceType: row.evidenceType,
    provenance: {
      ...(row.provenance as Record<string, unknown>),
      kind: "subject_edit",
      person_id: personId,
      edited_from: row.id,
    } as never,
    embedding: vector,
    embeddingModel: vector ? embedding.model : null,
  });
  revalidatePath("/me");
}

export async function removeAssertion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const { db, personId } = await me();
  const row = await mine(db, personId, id);

  // Superseded with no successor. The row stops being current; it does not
  // stop having been said.
  await db
    .update(assertions)
    .set({
      status: "superseded",
      provenance: sql`${assertions.provenance} || ${JSON.stringify({ retracted: true, person_id: personId })}::jsonb`,
    })
    .where(and(eq(assertions.id, row.id), eq(assertions.status, "active")));
  revalidatePath("/me");
}

export async function addSought(formData: FormData): Promise<void> {
  await addCapability(formData, "mechanism_sought");
}

export async function addCommanded(formData: FormData): Promise<void> {
  await addCapability(formData, "mechanism_commanded");
}

async function addCapability(formData: FormData, facet: "mechanism_sought" | "mechanism_commanded"): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text || text.length > 2000) throw new Error("Name a capability using 1 to 2,000 characters.");
  const { db, personId } = await me();
  const result = await embed([text]);

  await insertAssertion(db, {
    subjectType: "person",
    subjectId: personId,
    facet,
    text,
    sourceType: "subject_edit",
    confidence: "confirmed",
    provenance: { kind: "subject_edit", person_id: personId, added_at: "/me" } as never,
    embedding: result.vectors[0] ?? null,
    embeddingModel: result.vectors[0] ? result.model : null,
  });
  revalidatePath("/me");
}

export async function updateMatchingPreferences(formData: FormData): Promise<void> {
  const input = PreferenceInput.parse({
    discoverable: formData.get("discoverable") === "on",
    availability: String(formData.get("availability") ?? ""),
    intent: String(formData.get("intent") ?? ""),
  });
  const { db, personId } = await me(false);
  await savePreferences(db, personId, input);
  revalidatePath("/me");
  revalidatePath("/me/matches");
}

export async function refreshMatches(): Promise<void> {
  const { db, personId } = await me();
  const outcome = await query(db, "cofounder", { personId }, 3);
  for (const [rank, result] of outcome.results.entries()) {
    await rerankAndPersist(db, { edgeType: "cofounder", querySubjectType: "person", querySubjectId: personId, result, rank, skipModel: true });
  }
  revalidatePath("/me/matches");
}

export async function requestConversation(formData: FormData): Promise<void> {
  const matchResultId = String(formData.get("matchResultId") ?? "");
  const { db, personId } = await me();
  await requestIntroduction(db, matchResultId, personId);
  revalidatePath("/me/matches");
  revalidatePath("/me");
}

export async function dismissMatch(formData: FormData): Promise<void> {
  const matchResultId = String(formData.get("matchResultId") ?? "");
  const { db, personId } = await me();
  await dismiss(db, matchResultId, personId);
  revalidatePath("/me/matches");
}

export async function respondToIntroduction(formData: FormData): Promise<void> {
  const introductionId = String(formData.get("introductionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "accepted" && decision !== "declined") throw new Error("Unknown introduction response.");
  const { db, personId } = await me();
  await respondIntroduction(db, introductionId, personId, decision);
  revalidatePath("/me");
  revalidatePath("/me/matches");
}

export async function answerFollowUp(formData: FormData): Promise<void> {
  const matchResultId = String(formData.get("matchResultId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  if (verdict !== "helped" && verdict !== "not_helpful") throw new Error("unknown answer");
  const { db, personId } = await me();
  await recordFollowUp(db, matchResultId, personId, verdict);
  revalidatePath("/me");
}
