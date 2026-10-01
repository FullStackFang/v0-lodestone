import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, assertions, document, matchParams } from "@/db/schema";
import { EMBEDDING_DIMENSIONS } from "../embed";
import { putArtifactText } from "../canonical";
import { ensurePerson, insertAssertion } from "../ledger";
import type { Facet, Provenance } from "../schema";
import { analogies, exclusionFields, paperFields } from "./analogy";
import { priorArt } from "./priorArt";

/** A unit vector pointing at one axis, so cosines are exactly predictable:
 *  the same axis is 1, a different one is 0, a blend is in between. */
function vec(axis: number, blend = 0): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
  v[axis] = 1;
  if (blend > 0) v[(axis + 1) % EMBEDDING_DIMENSIONS] = blend;
  const norm = Math.sqrt(v.reduce((n, x) => n + x * x, 0));
  return v.map((x) => x / norm);
}

let db: Db;
let reader: string;
const papers: Record<string, string> = {};

async function makePaper(name: string, field: string, text: string) {
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: name, text })
    .returning({ id: document.id });
  await putArtifactText(db, {
    artifactId: doc.id,
    sourceFormat: "abstract",
    parser: "test-v1",
    text,
    provenance: { field, doi: `10.0/${name}`, authors: [name], year: 2024 },
  });
  papers[name] = doc.id;
  return doc.id;
}

async function paperSays(
  artifactId: string,
  facet: Facet,
  level: "specific" | "abstract" | "core" | null,
  text: string,
  embedding: number[] | null,
) {
  return insertAssertion(db, {
    subjectType: "paper",
    subjectId: artifactId,
    facet,
    abstractionLevel: level,
    text,
    sourceType: "abstract",
    sourceArtifactId: artifactId,
    provenance: { kind: "document", document_id: artifactId } as Provenance,
    embedding,
    embeddingModel: embedding ? "test-embed" : null,
  });
}

/** A question of the reader's, asked while reading `askedOn`. */
async function readerAsks(text: string, askedOn: string, level: "specific" | "abstract", embedding: number[]) {
  return insertAssertion(db, {
    subjectType: "person",
    subjectId: reader,
    facet: "purpose",
    abstractionLevel: level,
    text,
    sourceType: "annotation",
    sourceArtifactId: askedOn,
    provenance: { kind: "annotation", annotation_id: "seed", artifact_id: askedOn } as Provenance,
    confidence: "confirmed",
    embedding,
    embeddingModel: "test-embed",
  });
}

beforeEach(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });

  // The paper the reader is reading, and two candidates: one in another
  // field, one in the same one.
  await makePaper("home", "Medicine", "The clinic paper the reader is reading.");
  await makePaper("elsewhere", "Engineering", "A bridge paper from another field.");
  await makePaper("neighbour", "Medicine", "Another clinic paper, same field.");

  // Both candidates say the same abstract-level thing, on axis 5.
  await paperSays(papers.elsewhere, "purpose", "abstract", "watch a slow drift cheaply", vec(5));
  await paperSays(papers.elsewhere, "purpose", "specific", "instrument a bridge with cheap nodes", vec(9));
  await paperSays(papers.elsewhere, "domain", null, "structural monitoring", vec(20));
  await paperSays(papers.neighbour, "purpose", "abstract", "watch a slow drift cheaply", vec(5));
  await paperSays(papers.neighbour, "purpose", "specific", "track no-shows in a clinic", vec(9));
  // A different word for the reader's own domain: the field is what
  // excludes it, never this string.
  await paperSays(papers.neighbour, "domain", null, "HCI", vec(21));
  await paperSays(papers.home, "domain", null, "human-computer interaction", vec(22));
});

describe("exclusionFields", () => {
  it("is a paper's own field", async () => {
    expect(await exclusionFields(db, { subjectType: "paper", subjectId: papers.home })).toEqual(["Medicine"]);
  });

  it("is the field of the papers a reader's questions were asked on", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    expect(await exclusionFields(db, { subjectType: "person", subjectId: reader })).toEqual(["Medicine"]);
  });

  it("knows every ingested paper's field", async () => {
    const fields = await paperFields(db);
    expect(fields.get(papers.elsewhere)).toBe("Engineering");
    expect(fields.get(papers.neighbour)).toBe("Medicine");
  });
});

describe("analogies", () => {
  it("keeps the other field and drops the reader's own", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));

    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(results.map((r) => r.subjectId)).toEqual([papers.elsewhere]);
    expect(results[0].components.sim_abs).toBeCloseTo(1, 6);
    expect(results[0].source).toBe("question");
  });

  it("excludes a same-field paper however different its domain text is", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    // "HCI" and "human-computer interaction" are different strings and the
    // same OpenAlex field; the filter reads the field.
    expect(results.some((r) => r.subjectId === papers.neighbour)).toBe(false);
  });

  it("names the query row that produced the result", async () => {
    const question = await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    const [result] = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(result.queryAssertionId).toBe(question.id);
    expect(result.candidateAssertionIds.length).toBeGreaterThan(0);
  });

  it("reads λ from the table, not from this module", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    // Give the reader a specific purpose that the candidate also has, so a
    // λ change moves the score.
    await readerAsks("track a clinic's no-shows", papers.home, "specific", vec(9));

    const before = (await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 }))[0].score;
    await db.update(matchParams).set({ lambda: 0.9 }).where(eq(matchParams.edgeType, "paper_analogy"));
    const after = (await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 }))[0].score;
    expect(after).toBeLessThan(before);
  });

  it("takes a constraint as a second query and labels what it produced", async () => {
    // No question at all: only a constraint, scored as an abstract purpose.
    await insertAssertion(db, {
      subjectType: "person",
      subjectId: reader,
      facet: "constraint",
      text: "no cheap way to measure no-show rates",
      sourceType: "annotation",
      sourceArtifactId: papers.home,
      provenance: { kind: "annotation", annotation_id: "seed" } as Provenance,
      confidence: "confirmed",
      embedding: vec(5),
      embeddingModel: "test-embed",
    });

    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(results.map((r) => r.subjectId)).toEqual([papers.elsewhere]);
    expect(results[0].source).toBe("constraint");
  });

  it("returns nothing, and costs nothing, when the reader has asked nothing", async () => {
    // No questions, no constraints: the scorer would hand back every
    // candidate tied at zero, and each one would cost a rerank call.
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(results).toEqual([]);
    expect(await priorArt(db, { subjectType: "person", subjectId: reader }, { k: 5 })).toEqual([]);
  });

  it("returns nothing when there are no candidates outside the field", async () => {
    await db.delete(assertions).where(eq(assertions.subjectId, papers.elsewhere));
    await db.delete(artifactTexts).where(eq(artifactTexts.artifactId, papers.elsewhere));
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    const results = await analogies(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(results).toEqual([]);
  });
});

describe("priorArt", () => {
  it("returns the same-field paper the analogy query excluded", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    const results = await priorArt(db, { subjectType: "person", subjectId: reader }, { k: 5 });
    expect(results.map((r) => r.subjectId)).toEqual([papers.neighbour]);
  });

  it("does not penalise a shared mechanism, because its μ is its own", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    await insertAssertion(db, {
      subjectType: "person",
      subjectId: reader,
      facet: "mechanism",
      text: "a cheap daily count",
      sourceType: "annotation",
      sourceArtifactId: papers.home,
      provenance: { kind: "annotation", annotation_id: "seed" } as Provenance,
      confidence: "confirmed",
      embedding: vec(30),
      embeddingModel: "test-embed",
    });
    await paperSays(papers.neighbour, "mechanism", null, "a cheap daily count", vec(30));

    await db.update(matchParams).set({ lambda: 0, mu: 0 }).where(eq(matchParams.edgeType, "prior_art"));
    const sharing = (await priorArt(db, { subjectType: "person", subjectId: reader }, { k: 5 }))[0];
    expect(sharing.components.sim_mech).toBeCloseTo(1, 6);
    // μ = 0 on this edge: the shared mechanism did not cost it anything.
    expect(sharing.score).toBeCloseTo(sharing.components.sim_abs, 6);
  });

  it("is unaffected by the analogy edge's parameters", async () => {
    await readerAsks("how do we see the drift?", papers.home, "abstract", vec(5));
    await readerAsks("track a clinic's no-shows", papers.home, "specific", vec(9));
    const before = (await priorArt(db, { subjectType: "person", subjectId: reader }, { k: 5 }))[0].score;
    await db.update(matchParams).set({ mu: 0.99, lambda: 0.99 }).where(eq(matchParams.edgeType, "paper_analogy"));
    const after = (await priorArt(db, { subjectType: "person", subjectId: reader }, { k: 5 }))[0].score;
    expect(after).toBe(before);
  });
});
