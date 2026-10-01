import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, document, extractionRuns, readingSessions } from "@/db/schema";
import { hashText, putArtifactText } from "../canonical";
import { NOT_STATED, ensurePerson, insertAssertion } from "../ledger";
import { saveAnnotation } from "../papers/annotate";
import { reconcileSession } from "../papers/reconcile";
import { endSession } from "../papers/session";
import type { Facet, Provenance, ReadingMode } from "../schema";
import { fold } from "./fold";
import { report, scoreGold } from "./gold";

/** A text whose hash lands in the fold we want, found by trying suffixes —
 *  the fold is a function of the hash and nothing can move it. */
function textInFold(base: string, wanted: number): string {
  for (let n = 0; n < 500; n++) {
    const candidate = `${base} Run ${n} of the study.`;
    if (fold(hashText(candidate)) === wanted) return candidate;
  }
  throw new Error("no text landed in that fold");
}

const BASE =
  "We measure the cost the rural clinic pays for a diagnosis, using a low-cost turnaround metric that any nurse can run.";

let db: Db;
let reader: string;

async function makeArtifact(text: string) {
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: "A paper", text })
    .returning({ id: document.id });
  const put = await putArtifactText(db, {
    artifactId: doc.id,
    sourceFormat: "abstract",
    parser: "test-v1",
    text,
  });
  return { artifactId: doc.id, textHash: put.textHash, text };
}

async function makeRun(textHash: string) {
  const [run] = await db
    .insert(extractionRuns)
    .values({
      textHash,
      variant: "abstract",
      promptVersion: "p1",
      coreVersion: "c1",
      model: "test:model",
      status: "ok",
    })
    .returning();
  return run;
}

async function modelSays(
  artifact: { artifactId: string; textHash: string; text: string },
  runId: string,
  quote: string,
  facet: Facet,
) {
  const start = artifact.text.indexOf(quote);
  if (start < 0) throw new Error(`not in the text: ${quote}`);
  return insertAssertion(db, {
    subjectType: "paper",
    subjectId: artifact.artifactId,
    facet,
    abstractionLevel: facet === "purpose" ? "specific" : null,
    text: quote,
    sourceType: "abstract",
    sourceArtifactId: artifact.artifactId,
    textHash: artifact.textHash,
    startOff: start,
    endOff: start + quote.length,
    quote,
    provenance: { kind: "document", document_id: artifact.artifactId } as Provenance,
    extractionRunId: runId,
  });
}

async function readAndMark(
  artifact: { artifactId: string; textHash: string; text: string },
  marks: { quote: string; tag: string }[],
  mode: ReadingMode = "casual",
) {
  const [session] = await db
    .insert(readingSessions)
    .values({ readerId: reader, artifactId: artifact.artifactId, textHash: artifact.textHash, mode })
    .returning({ id: readingSessions.id });
  for (const mark of marks) {
    const start = artifact.text.indexOf(mark.quote);
    await saveAnnotation(db, {
      sessionId: session.id,
      start,
      end: start + mark.quote.length,
      selected: mark.quote,
      tag: mark.tag,
    });
  }
  return session.id;
}

beforeEach(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });
});

describe("scoreGold", () => {
  it("scores an exact agreement as one", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);
    await modelSays(artifact, run.id, "measure the cost the rural clinic pays", "purpose");
    await readAndMark(artifact, [{ quote: "measure the cost the rural clinic pays", tag: "intent" }]);

    const scores = await scoreGold(db);
    expect(scores).toHaveLength(1);
    expect(scores[0].score.headline).toBe(1);
    expect(report(scores).headline).toBe(1);
  });

  it("never reads fold 0", async () => {
    const held = await makeArtifact(textInFold(BASE, 0));
    const training = await makeArtifact(textInFold(BASE, 2));
    for (const artifact of [held, training]) {
      const run = await makeRun(artifact.textHash);
      await modelSays(artifact, run.id, "measure the cost the rural clinic pays", "purpose");
      await readAndMark(artifact, [{ quote: "measure the cost the rural clinic pays", tag: "intent" }]);
    }

    const scores = await scoreGold(db);
    expect(scores.map((s) => s.textHash)).toEqual([training.textHash]);
    expect(fold(held.textHash)).toBe(0);

    const heldOut = await scoreGold(db, { heldOut: true });
    expect(heldOut.map((s) => s.textHash)).toEqual([held.textHash]);
  });

  it("reports recall only where a session was complete", async () => {
    const casual = await makeArtifact(textInFold(BASE, 1));
    const casualRun = await makeRun(casual.textHash);
    await modelSays(casual, casualRun.id, "measure the cost", "purpose");
    await readAndMark(casual, [{ quote: "measure the cost the rural clinic pays", tag: "intent" }], "casual");

    let summary = report(await scoreGold(db));
    expect(summary.completeN).toBe(0);
    expect(summary.recall).toBeNull();

    const complete = await makeArtifact(textInFold(`${BASE} Second.`, 3));
    const completeRun = await makeRun(complete.textHash);
    await modelSays(complete, completeRun.id, "measure the cost the rural clinic pays", "purpose");
    const sessionId = await readAndMark(
      complete,
      [{ quote: "measure the cost the rural clinic pays", tag: "intent" }],
      "exhaustive",
    );
    await endSession(db, sessionId, [], { classify: async () => null });

    summary = report(await scoreGold(db));
    expect(summary.completeN).toBe(1);
    expect(summary.recall).not.toBeNull();
  });

  it("still credits a find the reader superseded", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);
    const model = await modelSays(artifact, run.id, "measure the cost the rural clinic pays", "purpose");
    const sessionId = await readAndMark(artifact, [
      { quote: "measure the cost the rural clinic pays", tag: "intent" },
    ]);
    await reconcileSession(db, sessionId);

    const [retired] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(retired.status).toBe("superseded");

    // The row is gone from `active`, and the score is still 1: the model
    // found it, and reconciliation retired the row, not the find.
    const scores = await scoreGold(db);
    expect(scores[0].score.token.purpose.f1).toBe(1);
    expect(scores[0].score.span.purpose.f1).toBe(1);
  });

  it("gives partial credit for a boundary the reader moved", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);
    await modelSays(artifact, run.id, "We measure the cost the rural clinic pays", "purpose");
    await readAndMark(artifact, [{ quote: "measure the cost the rural clinic pays", tag: "intent" }]);

    const [scored] = await scoreGold(db);
    expect(scored.score.span.purpose.f1).toBe(0);
    expect(scored.score.token.purpose.recall).toBe(1);
    expect(scored.score.token.purpose.precision).toBeLessThan(1);
  });

  it("scores nothing for an artifact nobody read", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);
    await modelSays(artifact, run.id, "measure the cost", "purpose");
    expect(await scoreGold(db)).toEqual([]);
  });
});

describe("the not_stated column", () => {
  it("counts a hit, a miss and a false positive", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);

    // The model says there is no constraint and no evaluation, and states a
    // mechanism.
    for (const facet of ["constraint", "evaluation"] as Facet[]) {
      await insertAssertion(db, {
        subjectType: "paper",
        subjectId: artifact.artifactId,
        facet,
        text: NOT_STATED,
        sourceType: "abstract",
        sourceArtifactId: artifact.artifactId,
        provenance: { kind: "document", document_id: artifact.artifactId } as Provenance,
        extractionRunId: run.id,
      });
    }
    await modelSays(artifact, run.id, "a low-cost turnaround metric", "mechanism");
    await modelSays(artifact, run.id, "measure the cost the rural clinic pays", "purpose");

    // The reader marks an evaluation the model called absent (a miss), a
    // purpose, and says the mechanism facet is absent (a false positive
    // for the mechanism the model stated). Constraint they agree on.
    const sessionId = await readAndMark(
      artifact,
      [
        { quote: "measure the cost the rural clinic pays", tag: "intent" },
        { quote: "that any nurse can run", tag: "eval" },
      ],
      "exhaustive",
    );
    await endSession(db, sessionId, ["constraint", "mechanism"] as Facet[], { classify: async () => null });

    const [scored] = await scoreGold(db);
    expect(scored.complete).toBe(true);
    expect(scored.notStated.hits).toBe(1); // constraint
    expect(scored.notStated.misses).toBe(1); // evaluation
    expect(scored.notStated.falsePositives).toBe(1); // mechanism
    expect(report([scored]).notStated).toBeCloseTo(1 / 3, 6);
  });

  it("is n/a when no session was complete", async () => {
    const artifact = await makeArtifact(textInFold(BASE, 1));
    const run = await makeRun(artifact.textHash);
    await modelSays(artifact, run.id, "measure the cost the rural clinic pays", "purpose");
    await readAndMark(artifact, [{ quote: "measure the cost the rural clinic pays", tag: "intent" }]);
    expect(report(await scoreGold(db)).notStated).toBeNull();
  });
});
