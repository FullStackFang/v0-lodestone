import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { document, judgments, matchResults } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { EMBEDDING_DIMENSIONS } from "../embed";
import { ensurePerson, insertAssertion } from "../ledger";
import type { Provenance } from "../schema";
import { analogies } from "./analogy";
import { NoResult, judgeResult } from "./judge";
import { paperSummary, rerankAndShow, showWithoutRerank } from "./rerank";

function vec(axis: number): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
  v[axis] = 1;
  return v;
}

let db: Db;
let reader: string;
let home: string;
let elsewhere: string;

function fakeReranker() {
  const calls: string[] = [];
  const structured = (async (_schema: unknown, request: { prompt: string; model?: string }) => {
    calls.push(request.model ?? "default");
    return {
      output: {
        mapping: "continuous strain on a cable ↔ a daily signal you do not collect",
        verdict: "generative",
        why: "Both watch something that drifts too slowly to notice.",
      },
      model: "test:model",
      usage: null,
    };
  }) as never;
  return { structured, calls };
}

async function makePaper(title: string, field: string, text: string) {
  const [doc] = await db.insert(document).values({ source: "paper", title, text }).returning({ id: document.id });
  await putArtifactText(db, {
    artifactId: doc.id,
    sourceFormat: "abstract",
    parser: "test-v1",
    text,
    provenance: { field, doi: "10.0/x", authors: ["A. Author", "B. Author"], year: 2019, venue: "A Journal", url: "https://doi.org/10.0/x" },
  });
  return doc.id;
}

beforeEach(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });
  home = await makePaper("The clinic paper", "Medicine", "A clinic abstract.");
  elsewhere = await makePaper("The bridge paper", "Engineering", "A bridge abstract.");

  await insertAssertion(db, {
    subjectType: "paper",
    subjectId: elsewhere,
    facet: "purpose",
    abstractionLevel: "abstract",
    text: "watch a slow drift cheaply",
    sourceType: "abstract",
    sourceArtifactId: elsewhere,
    provenance: { kind: "document", document_id: elsewhere } as Provenance,
    embedding: vec(5),
    embeddingModel: "test-embed",
  });
  await insertAssertion(db, {
    subjectType: "paper",
    subjectId: elsewhere,
    facet: "mechanism",
    text: "event-triggered sensing on cheap nodes",
    sourceType: "abstract",
    sourceArtifactId: elsewhere,
    provenance: { kind: "document", document_id: elsewhere } as Provenance,
    embedding: vec(40),
    embeddingModel: "test-embed",
  });
});

/** A question of the reader's, asked on the clinic paper. */
async function ask(text: string) {
  return insertAssertion(db, {
    subjectType: "person",
    subjectId: reader,
    facet: "purpose",
    abstractionLevel: "abstract",
    text,
    sourceType: "annotation",
    sourceArtifactId: home,
    provenance: { kind: "annotation", annotation_id: "seed" } as Provenance,
    confidence: "confirmed",
    embedding: vec(5),
    embeddingModel: "test-embed",
  });
}

describe("paperSummary", () => {
  it("builds the citation from stored provenance, with no second request", async () => {
    const summary = await paperSummary(db, elsewhere);
    expect(summary.citation).toBe("A. Author, B. Author. (2019). The bridge paper. A Journal");
    expect(summary.field).toBe("Engineering");
    expect(summary.url).toBe("https://doi.org/10.0/x");
    expect(summary.mechanisms).toEqual(["event-triggered sensing on cheap nodes"]);
  });
});

describe("rerankAndShow", () => {
  it("calls the reranker once per candidate and records the exposure", async () => {
    await ask("how do we see the drift?");
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    const model = fakeReranker();
    const shown = await rerankAndShow(
      db,
      { edgeType: "paper_analogy", query: { subjectType: "person", subjectId: reader }, results },
      { structured: model.structured },
    );

    expect(model.calls).toHaveLength(results.length);
    expect(shown[0].rank).toBe(1);
    expect(shown[0].card?.verdict).toBe("generative");

    const rows = await db.select().from(matchResults);
    expect(rows).toHaveLength(1);
    expect(rows[0].shownAt).not.toBeNull();
    expect(rows[0].rank).toBe(1);
    expect(rows[0].promptVersion).not.toBeNull();
    expect(rows[0].assertionSetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the configured rerank model", async () => {
    process.env.HARNESS_RERANK_MODEL = "claude-haiku-4-5-20251001";
    await ask("how do we see the drift?");
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    const model = fakeReranker();
    await rerankAndShow(
      db,
      { edgeType: "paper_analogy", query: { subjectType: "person", subjectId: reader }, results },
      { structured: model.structured },
    );
    expect(model.calls[0]).toBe("claude-haiku-4-5-20251001");
    delete process.env.HARNESS_RERANK_MODEL;
  });

  it("keeps the exposure when the rerank fails, without a card", async () => {
    await ask("how do we see the drift?");
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    const failing = (async () => {
      throw new Error("no model");
    }) as never;
    const shown = await rerankAndShow(
      db,
      { edgeType: "paper_analogy", query: { subjectType: "person", subjectId: reader }, results },
      { structured: failing },
    );
    expect(shown[0].card).toBeNull();
    const [row] = await db.select().from(matchResults);
    expect(row.card).toBeNull();
    expect(row.promptVersion).toBeNull();
    expect(row.shownAt).not.toBeNull();
  });

  it("makes no model call for prior art", async () => {
    await ask("how do we see the drift?");
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    const shown = await showWithoutRerank(db, {
      edgeType: "prior_art",
      query: { subjectType: "person", subjectId: reader },
      results,
    });
    expect(shown[0].card).toBeNull();
    const [row] = await db.select().from(matchResults);
    expect(row.edgeType).toBe("prior_art");
    expect(row.promptVersion).toBeNull();
  });
});

describe("judging a card", () => {
  async function shownOnce() {
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    const model = fakeReranker();
    return rerankAndShow(
      db,
      { edgeType: "paper_analogy", query: { subjectType: "person", subjectId: reader }, results },
      { structured: model.structured },
    );
  }

  it("records the verdict against the result, the rank and the query row", async () => {
    const question = await ask("how do we see the drift?");
    const [shown] = await shownOnce();

    await judgeResult(db, {
      matchResultId: shown.matchResultId,
      readerId: reader,
      verdict: "requested",
      sessionId: "a-session",
      parameters: { lambda: 0.3, mu: 0.3 },
    });

    const [row] = await db.select().from(judgments);
    expect(row.verdict).toBe("requested");
    expect(row.matchResultId).toBe(shown.matchResultId);
    expect(row.rank).toBe(1);
    expect(row.queryAssertionId).toBe(question.id);
    expect(row.candidateSubjectId).toBe(elsewhere);
    expect(row.candidateAssertionIds.length).toBeGreaterThan(0);
    expect(row.context).toMatchObject({ session_id: "a-session", lambda: 0.3, mu: 0.3 });
  });

  it("writes two rows when the same paper is judged under two questions", async () => {
    const first = await ask("how do we see the drift?");
    const [shownFirst] = await shownOnce();
    await judgeResult(db, { matchResultId: shownFirst.matchResultId, readerId: reader, verdict: "requested" });

    // A second question, and a second showing of the same paper.
    const second = await insertAssertion(db, {
      subjectType: "person",
      subjectId: reader,
      facet: "purpose",
      abstractionLevel: "abstract",
      text: "what would tell us early?",
      sourceType: "annotation",
      sourceArtifactId: home,
      provenance: { kind: "annotation", annotation_id: "seed-2" } as Provenance,
      confidence: "confirmed",
      embedding: vec(5),
      embeddingModel: "test-embed",
    });
    await db.delete(judgments).where(eq(judgments.queryAssertionId, second.id));
    const [shownSecond] = await shownOnce();
    await judgeResult(db, { matchResultId: shownSecond.matchResultId, readerId: reader, verdict: "dismissed" });

    const rows = await db.select().from(judgments);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.candidateSubjectId)).toEqual([elsewhere, elsewhere]);
    expect(new Set(rows.map((r) => r.matchResultId)).size).toBe(2);
    expect(rows.map((r) => r.verdict).sort()).toEqual(["dismissed", "requested"]);
    expect([first.id, second.id]).toContain(rows[0].queryAssertionId);
  });

  it("refuses without a result id, before any write", async () => {
    await ask("how do we see the drift?");
    await expect(
      judgeResult(db, { matchResultId: "", readerId: reader, verdict: "requested" }),
    ).rejects.toThrow(NoResult);
    await expect(
      judgeResult(db, {
        matchResultId: "00000000-0000-4000-8000-000000000000",
        readerId: reader,
        verdict: "requested",
      }),
    ).rejects.toThrow(NoResult);
    expect(await db.select().from(judgments)).toHaveLength(0);
  });
});
