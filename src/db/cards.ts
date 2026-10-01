/** Cards, sessions, documents and events — every write to the contract goes
 *  through here. `applyPatch` is the only path that changes a methodology
 *  field, and it validates before it merges and derives `status` after.
 *  `writeStageEvent` is insert-only; there is no update. */
import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { CardPatch, EMPTY_FIELDS, mergePatch, type CardFields, type Door } from "@/schema/card";
import { statusFor } from "@/engine/gates";
import type { Db } from "./client";
import {
  document,
  session,
  stageEvent,
  thesisCard,
  type NewStageEvent,
  type StageEventRow,
  type ThesisCardRow,
} from "./schema";

/** The row's methodology columns as the Zod-shaped object the gates read. */
export function fieldsOf(row: ThesisCardRow): CardFields {
  return {
    idea_text: row.ideaText,
    offering: row.offering,
    segment: row.segment,
    value_proposition: row.valueProposition,
    jtbd: row.jtbd,
    economic_buyer: row.economicBuyer,
    beachhead: row.beachhead,
    four_us: row.fourUs,
    rubric_scores: row.rubricScores,
    kill_assumption: row.killAssumption,
    facets: row.facets,
    evidence: row.evidence,
    founder_context: row.founderContext,
  };
}

function columnsOf(f: CardFields) {
  return {
    ideaText: f.idea_text,
    offering: f.offering,
    segment: f.segment,
    valueProposition: f.value_proposition,
    jtbd: f.jtbd,
    economicBuyer: f.economic_buyer,
    beachhead: f.beachhead,
    fourUs: f.four_us,
    rubricScores: f.rubric_scores,
    killAssumption: f.kill_assumption,
    facets: f.facets,
    evidence: f.evidence ?? null,
    founderContext: f.founder_context ?? null,
  };
}

/** 10 url-safe chars, ~60 bits. Not the title: a share link should not
 *  leak what the card says before it is opened. */
export function newSlug(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

export async function createSession(db: Db, personId?: string): Promise<string> {
  const [row] = await db
    .insert(session)
    .values(personId ? { personId } : {})
    .returning({ id: session.id });
  return row.id;
}

export async function sessionExists(db: Db, id: string): Promise<boolean> {
  const rows = await db.select({ id: session.id }).from(session).where(eq(session.id, id)).limit(1);
  return rows.length === 1;
}

/** The person behind a session, or null for a legacy session — one created
 *  before intake asked, or by a visitor who left the form. */
export async function personOfSession(db: Db, sessionId: string): Promise<string | null> {
  const rows = await db
    .select({ personId: session.personId })
    .from(session)
    .where(eq(session.id, sessionId))
    .limit(1);
  return rows[0]?.personId ?? null;
}

/** A card belongs to a founder, and a founder is a person. Thrown rather
 *  than silently written so no card can exist that no one owns. */
export class PersonRequired extends Error {}

/** Are these two sessions the same founder? The same session always is; two
 *  different ones are only when both name the same person. Two person-less
 *  sessions are never the same founder — null is not an identity. */
export async function sameFounder(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const [one, two] = await Promise.all([personOfSession(db, a), personOfSession(db, b)]);
  return one !== null && one === two;
}

export async function createDocument(
  db: Db,
  input: { sessionId: string; source: "deck" | "resume" | "paper"; title: string | null; text: string },
): Promise<string> {
  const [row] = await db.insert(document).values(input).returning({ id: document.id });
  return row.id;
}

export async function getDocument(db: Db, id: string) {
  const rows = await db.select().from(document).where(eq(document.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCard(
  db: Db,
  input: { sessionId: string; door: Door; docId?: string; ideaText?: string },
): Promise<ThesisCardRow> {
  if ((await personOfSession(db, input.sessionId)) === null) {
    throw new PersonRequired("a card needs a person: link the session at intake first");
  }
  const fields: CardFields = { ...EMPTY_FIELDS, idea_text: input.ideaText ?? null };
  const [row] = await db
    .insert(thesisCard)
    .values({
      sessionId: input.sessionId,
      slug: newSlug(),
      status: statusFor(fields),
      provenance: { source: input.door === "blank" ? "chat" : input.door, doc_id: input.docId ?? null },
      ...columnsOf(fields),
    })
    .returning();
  return row;
}

export async function getCard(db: Db, id: string): Promise<ThesisCardRow | null> {
  const rows = await db.select().from(thesisCard).where(eq(thesisCard.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getCardBySlug(db: Db, slug: string): Promise<ThesisCardRow | null> {
  const rows = await db.select().from(thesisCard).where(eq(thesisCard.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/** Validate, merge, derive status, write. Throws on an invalid patch —
 *  callers that got the patch from a model must have validated already;
 *  this is the last line, not the first. */
export async function applyPatch(
  db: Db,
  card: ThesisCardRow,
  patch: unknown,
  patchEventId?: string,
): Promise<ThesisCardRow> {
  const valid = CardPatch.parse(patch);
  return db.transaction(async (tx) => {
    // Merge under a row lock so a stale caller cannot replace newer fields.
    const [current] = await tx.select().from(thesisCard).where(eq(thesisCard.id, card.id)).for("update");
    if (!current) throw new Error("idea no longer exists");
    const next = mergePatch(fieldsOf(current), valid);
    const [row] = await tx
      .update(thesisCard)
      .set({ ...columnsOf(next), status: statusFor(next), updatedAt: new Date() })
      .where(eq(thesisCard.id, card.id))
      .returning();
    // The projection and its assertions commit together, including when
    // extraction cannot obtain an embedding from its configured provider.
    const { applyCanvas } = await import("@/harness/founder/canvas");
    await applyCanvas(tx as unknown as Db, row.id, patchEventId ?? `direct:${row.id}`);
    return row;
  });
}

export async function writeStageEvent(db: Db, event: NewStageEvent): Promise<StageEventRow> {
  const [row] = await db.insert(stageEvent).values(event).returning();
  return row;
}

/** The thread, oldest first. */
export async function listStageEvents(db: Db, cardId: string): Promise<StageEventRow[]> {
  return db.select().from(stageEvent).where(eq(stageEvent.cardId, cardId)).orderBy(asc(stageEvent.createdAt));
}
