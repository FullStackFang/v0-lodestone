import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { EMBEDDING_DIMENSIONS, assertions, judgments, matchResults } from "@/db/schema";
import { ensurePerson, insertAssertion } from "@/harness/ledger";
import type { StructuredFn } from "@/harness/model";
import { query } from "./queries";
import { JUDGMENT_GATE, enabledEdges, recompute } from "./recompute";
import { RerankCard, rerankAndPersist } from "./rerank";
import { publishFixture } from "./test-fixtures";

let db: Db;

const unit = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[0] = Math.cos(r);
  v[1] = Math.sin(r);
  return v;
};

const CARD: RerankCard = {
  mappings: [{ theirs: "shipped three iOS apps", yours: "you are looking for an engineer" }],
  verdict: "generative",
  commitment: "unknown",
  why: "He builds what she sells, and they are pointed at the same hour of the day.",
};

function fakeRerank(counter: { calls: number }, card: RerankCard | Error = CARD): StructuredFn {
  return (async () => {
    counter.calls += 1;
    if (card instanceof Error) throw card;
    return { output: card as never, model: "fake-haiku", usage: { input_tokens: 1, output_tokens: 1 } };
  }) as StructuredFn;
}

async function founder(name: string, angle: number) {
  const personId = await ensurePerson(db, { name, email: `${name}@rerank.edu` });
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });
  await db.delete(assertions).where(eq(assertions.subjectId, card.id));
  await insertAssertion(db, {
    subjectType: "idea",
    subjectId: card.id,
    facet: "purpose",
    abstractionLevel: "specific",
    text: `${name}'s problem`,
    sourceType: "canvas",
    provenance: { kind: "canvas", card_id: card.id, field: "idea_text", patch_event_id: "p" },
    embedding: unit(angle),
    embeddingModel: "test",
  });
  await insertAssertion(db, {
    subjectType: "person",
    subjectId: personId,
    facet: "mechanism_commanded",
    text: `${name} commands something`,
    sourceType: "resume",
    provenance: { kind: "document", document_id: "d" },
    embedding: unit(angle + 90),
    embeddingModel: "test",
  });
  await publishFixture(db, personId, card.id);
  return { personId, cardId: card.id };
}

beforeEach(async () => {
  db = await createPgliteDb();
});

describe("rerankAndPersist", () => {
  it("writes the card, the rank and every component", async () => {
    const maya = await founder("maya", 0);
    await founder("omar", 3);
    const counter = { calls: 0 };
    const { results } = await query(db, "cofounder", { personId: maya.personId }, 3);

    const { row, card } = await rerankAndPersist(
      db,
      {
        edgeType: "cofounder",
        querySubjectType: "person",
        querySubjectId: maya.personId,
        result: results[0],
        rank: 0,
      },
      { structured: fakeRerank(counter) },
    );

    expect(counter.calls).toBe(1);
    expect(card).toEqual(CARD);
    expect(row.rank).toBe(0);
    expect(row.assertionSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.promptVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(row.components)).toContain("cover_sought_commanded");
    expect(row.shownAt).toBeNull();
  });

  it("does not call the model twice for two subjects that have not moved", async () => {
    const maya = await founder("maya", 0);
    await founder("omar", 3);
    const counter = { calls: 0 };
    const deps = { structured: fakeRerank(counter) };
    const { results } = await query(db, "cofounder", { personId: maya.personId }, 3);
    const input = {
      edgeType: "cofounder" as const,
      querySubjectType: "person" as const,
      querySubjectId: maya.personId,
      result: results[0],
      rank: 0,
    };

    await rerankAndPersist(db, input, deps);
    const second = await rerankAndPersist(db, input, deps);
    expect(counter.calls).toBe(1);
    expect(second.cached).toBe(true);
  });

  it("a new assertion on either side invalidates the card", async () => {
    const maya = await founder("maya", 0);
    const omar = await founder("omar", 3);
    const counter = { calls: 0 };
    const deps = { structured: fakeRerank(counter) };
    const first = await query(db, "cofounder", { personId: maya.personId }, 3);
    const input = {
      edgeType: "cofounder" as const,
      querySubjectType: "person" as const,
      querySubjectId: maya.personId,
      result: first.results[0],
      rank: 0,
    };
    await rerankAndPersist(db, input, deps);

    await insertAssertion(db, {
      subjectType: "person",
      subjectId: omar.personId,
      facet: "mechanism_commanded",
      text: "and something else",
      sourceType: "conversation",
      provenance: { kind: "conversation", stage_event_id: "later" },
      embedding: unit(95),
      embeddingModel: "test",
    });

    const again = await query(db, "cofounder", { personId: maya.personId }, 3);
    const second = await rerankAndPersist(db, { ...input, result: again.results[0] }, deps);
    expect(counter.calls).toBe(2);
    expect(second.cached).toBe(false);
  });

  it("a failed rerank keeps the score row and drops only the card", async () => {
    const maya = await founder("maya", 0);
    await founder("omar", 3);
    const counter = { calls: 0 };
    const { results } = await query(db, "cofounder", { personId: maya.personId }, 3);

    const { row, card } = await rerankAndPersist(
      db,
      {
        edgeType: "cofounder",
        querySubjectType: "person",
        querySubjectId: maya.personId,
        result: results[0],
        rank: 0,
      },
      { structured: fakeRerank(counter, new Error("model down")) },
    );

    expect(card).toBeNull();
    expect(row.card).toBeNull();
    expect(row.candidateSubjectId).toBeTruthy();
  });
});

describe("recompute", () => {
  it("runs only cofounder until the hundredth judgment", async () => {
    await founder("maya", 0);
    await founder("omar", 3);
    expect(await enabledEdges(db, {})).toEqual(["cofounder"]);

    const summary = await recompute(db, { noRerank: true });
    expect(Object.keys(summary.edges)).toEqual(["cofounder"]);
    expect(summary.gateMet).toBe(false);
    expect(summary.note).toMatch(new RegExp(`0 of ${JUDGMENT_GATE}`));
    expect(await db.select().from(judgments)).toHaveLength(0);
  });

  it("narrows to one subject when asked", async () => {
    const maya = await founder("maya", 0);
    await founder("omar", 3);
    const counter = { calls: 0 };

    const summary = await recompute(
      db,
      { edge: "cofounder", subject: maya.personId },
      { structured: fakeRerank(counter) },
    );

    expect(summary.note).toMatch(/narrowed to one subject/);
    const rows = await db.select().from(matchResults);
    expect(rows).toHaveLength(1);
    expect(rows[0].querySubjectId).toBe(maya.personId);
  });

  it("makes no model call with --no-rerank", async () => {
    await founder("maya", 0);
    await founder("omar", 3);
    const counter = { calls: 0 };
    const summary = await recompute(db, { noRerank: true }, { structured: fakeRerank(counter) });
    expect(counter.calls).toBe(0);
    expect(summary.rerankCalls).toBe(0);
    expect((await db.select().from(matchResults)).every((r) => r.card === null)).toBe(true);
  });
});
