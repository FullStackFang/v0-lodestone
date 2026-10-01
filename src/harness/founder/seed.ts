/** Twelve synthetic founders, through the real write path.
 *
 * Not fixtures inserted into tables: a person, a session and a card per
 * founder, the card fields through `applyPatch`, the resume through
 * `createDocument` + `ingestDocument`, and every turn through
 * `writeStageEvent` + `extractFromEvent` — so the bench exercises the
 * adapters rather than a hand-built ledger. Idempotent on the email.
 *
 *   npm run seed:synthetic            # scripted model, no cost
 *   VITEST=  npm run seed:synthetic   # the real engine, if you want it
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { applyPatch, createCard, createDocument, createSession, writeStageEvent } from "@/db/cards";
import { person, session, thesisCard } from "@/db/schema";
import type { ExtractDeps } from "@/harness/extract/core";
import { ensurePerson } from "@/harness/ledger";
import type { CardPatch } from "@/schema/card";
import { extractFromEvent } from "./conversation";
import { ingestDocument } from "./documents";

export interface SyntheticFounder {
  email: string;
  name: string;
  note: string;
  commitment: string;
  available_from: string | null;
  resume: string;
  turns: string[];
  fields: CardPatch;
}

export function loadSynthetic(): SyntheticFounder[] {
  const file = path.join(process.cwd(), "evals", "harness", "founder", "synthetic.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { founders: SyntheticFounder[] }).founders;
}

export interface SeedResult {
  created: number;
  existing: number;
  cards: Record<string, string>;
}

/** One founder, whole. Returns the card id whether it was made now or on a
 *  previous run. */
async function seedOne(
  db: Db,
  f: SyntheticFounder,
  deps: ExtractDeps,
): Promise<{ cardId: string; created: boolean }> {
  const existing = await db.select().from(person).where(eq(person.email, f.email.toLowerCase())).limit(1);
  if (existing[0]) {
    const cards = await db
      .select({ id: thesisCard.id })
      .from(thesisCard)
      .innerJoin(session, eq(thesisCard.sessionId, session.id))
      .where(eq(session.personId, existing[0].id))
      .limit(1);
    if (cards[0]) return { cardId: cards[0].id, created: false };
  }

  const personId = await ensurePerson(db, { name: f.name, email: f.email });
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });

  // The canvas adapter runs inside applyPatch, as it does for a real turn.
  await applyPatch(db, card, f.fields);

  const documentId = await createDocument(db, {
    sessionId,
    source: "resume",
    title: `${f.name} resume`,
    text: f.resume,
  });
  await ingestDocument(db, documentId, card.id, deps);

  for (const input of [...f.turns]) {
    const event = await writeStageEvent(db, {
      sessionId,
      cardId: card.id,
      stage: "thesis",
      userInputRaw: input,
      extractedFields: {},
      gateResult: "pass",
      promptVersion: "synthetic",
      model: "synthetic",
      reply: "noted",
    });
    await extractFromEvent(db, event.id, deps);
  }

  return { cardId: card.id, created: true };
}

export async function seedSynthetic(db: Db, deps: ExtractDeps = {}): Promise<SeedResult> {
  const founders = loadSynthetic();
  const result: SeedResult = { created: 0, existing: 0, cards: {} };
  for (const f of founders) {
    const { cardId, created } = await seedOne(db, f, deps);
    result.cards[f.email] = cardId;
    if (created) result.created += 1;
    else result.existing += 1;
  }
  return result;
}

