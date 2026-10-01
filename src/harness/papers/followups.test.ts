import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { document, judgments, matchResults, readingSessions } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { ensurePerson, insertAssertion, recordJudgment } from "../ledger";
import type { Provenance } from "../schema";
import { hasJudgments, pendingFollowups, previousSession, recordFollowup } from "./followups";

let db: Db;
let reader: string;
let paper: string;
let textHash: string;
let queryAssertionId: string;

const TEXT = "A paper about watching a slow drift cheaply.";

async function openSession() {
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId: reader, artifactId: paper, textHash, mode: "casual" })
    .returning({ id: readingSessions.id });
  return row.id;
}

/** A card shown to the reader, and the `requested` verdict on it. */
async function requested(sessionId: string) {
  const [result] = await db
    .insert(matchResults)
    .values({
      edgeType: "paper_analogy",
      querySubjectType: "person",
      querySubjectId: reader,
      candidateSubjectId: paper,
      score: 0.4,
      rank: 1,
      components: {
        sim_abs: 0.4,
        sim_spec: 0,
        sim_mech: 0,
        sim_domain: 0,
        sim_evidence: 0,
        contributors: {},
      },
      assertionSetHash: "x".repeat(64),
      shownAt: new Date(),
    })
    .returning({ id: matchResults.id });

  await recordJudgment(db, {
    readerId: reader,
    edgeType: "paper_analogy",
    queryAssertionId,
    candidateSubjectId: paper,
    candidateAssertionIds: [],
    matchResultId: result.id,
    rank: 1,
    verdict: "requested",
    context: { session_id: sessionId },
  });
  return result.id;
}

beforeEach(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: "The bridge paper", text: TEXT })
    .returning({ id: document.id });
  paper = doc.id;
  textHash = (
    await putArtifactText(db, { artifactId: paper, sourceFormat: "abstract", parser: "test-v1", text: TEXT })
  ).textHash;
  const question = await insertAssertion(db, {
    subjectType: "person",
    subjectId: reader,
    facet: "purpose",
    abstractionLevel: "abstract",
    text: "how do we see the drift?",
    sourceType: "annotation",
    provenance: { kind: "annotation", annotation_id: "seed" } as Provenance,
    confidence: "confirmed",
  });
  queryAssertionId = question.id;
});

describe("pendingFollowups", () => {
  it("asks nothing in a first sitting", async () => {
    const first = await openSession();
    expect(await previousSession(db, reader, first)).toBeNull();
    expect(await pendingFollowups(db, reader, first)).toEqual([]);
  });

  it("asks about the papers opened in the sitting before, by name", async () => {
    const first = await openSession();
    await requested(first);
    const second = await openSession();

    const pending = await pendingFollowups(db, reader, second);
    expect(pending).toHaveLength(1);
    // The title comes from the `document` row — the join that reads a uuid
    // column against a text subject id.
    expect(pending[0].title).toBe("The bridge paper");
    expect(pending[0].rank).toBe(1);
    expect(pending[0].queryAssertionId).toBe(queryAssertionId);
  });

  it("stops asking once the reader has answered", async () => {
    const first = await openSession();
    await requested(first);
    const second = await openSession();

    const [pending] = await pendingFollowups(db, reader, second);
    await recordFollowup(db, reader, pending, "helped");

    expect(await pendingFollowups(db, reader, second)).toEqual([]);
    const rows = await db.select().from(judgments).where(eq(judgments.matchResultId, pending.matchResultId));
    expect(rows.map((r) => r.verdict).sort()).toEqual(["helped", "requested"]);
  });

  it("does not raise a skipped paper again in the sitting after next", async () => {
    const first = await openSession();
    await requested(first);
    const second = await openSession();
    expect(await pendingFollowups(db, reader, second)).toHaveLength(1);

    // The reader skipped it; a third sitting asks about the second, which
    // opened nothing.
    const third = await openSession();
    expect(await pendingFollowups(db, reader, third)).toEqual([]);
  });

  it("asks nothing about a card that was only dismissed", async () => {
    const first = await openSession();
    const resultId = await requested(first);
    await db.delete(judgments).where(eq(judgments.matchResultId, resultId));
    await recordJudgment(db, {
      readerId: reader,
      edgeType: "paper_analogy",
      queryAssertionId,
      candidateSubjectId: paper,
      candidateAssertionIds: [],
      matchResultId: resultId,
      rank: 1,
      verdict: "dismissed",
      context: { session_id: first },
    });

    expect(await pendingFollowups(db, reader, await openSession())).toEqual([]);
  });
});

describe("hasJudgments", () => {
  it("is false until an edge has one, and true after", async () => {
    expect(await hasJudgments(db, "paper_analogy")).toBe(false);
    await requested(await openSession());
    expect(await hasJudgments(db, "paper_analogy")).toBe(true);
    expect(await hasJudgments(db, "prior_art")).toBe(false);
  });
});
