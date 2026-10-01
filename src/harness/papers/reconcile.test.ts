import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import {
  annotations,
  assertions,
  document,
  extractionRuns,
  readingSessions,
  reconciliations,
} from "@/db/schema";
import { putArtifactText } from "../canonical";
import { ensurePerson, insertAssertion } from "../ledger";
import type { Facet, ReadingMode } from "../schema";
import { saveAnnotation } from "./annotate";
import { reconcileSession, reconciliationQueue, resolveConflict } from "./reconcile";

const TEXT =
  "We measure the cost the rural clinic pays for a diagnosis, using a low-cost turnaround metric that any nurse can run.";

let db: Db;
let artifactId: string;
let textHash: string;
let reader: string;
let runId: string;

const spanOf = (quote: string) => {
  const start = TEXT.indexOf(quote);
  if (start < 0) throw new Error(`not in the fixture: ${quote}`);
  return { start, end: start + quote.length, selected: quote };
};

async function openSession(mode: ReadingMode = "casual") {
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId: reader, artifactId, textHash, mode })
    .returning({ id: readingSessions.id });
  return row.id;
}

/** A model assertion over a quote, as an extraction run would have written it. */
async function modelSays(quote: string, facet: Facet) {
  const span = spanOf(quote);
  return insertAssertion(db, {
    subjectType: "paper",
    subjectId: artifactId,
    facet,
    abstractionLevel: facet === "purpose" ? "specific" : null,
    text: quote,
    sourceType: "abstract",
    sourceArtifactId: artifactId,
    textHash,
    startOff: span.start,
    endOff: span.end,
    quote,
    provenance: { kind: "document", document_id: artifactId },
    extractionRunId: runId,
  });
}

beforeEach(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: "A paper", text: TEXT })
    .returning({ id: document.id });
  artifactId = doc.id;
  textHash = (
    await putArtifactText(db, { artifactId, sourceFormat: "abstract", parser: "test-v1", text: TEXT })
  ).textHash;
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
    .returning({ id: extractionRuns.id });
  runId = run.id;
});

describe("reconcileSession", () => {
  it("writes one row per filing annotation and none for a note", async () => {
    const sessionId = await openSession();
    await saveAnnotation(db, { sessionId, ...spanOf("measure the cost"), tag: "intent" });
    await saveAnnotation(db, { sessionId, ...spanOf("a low-cost turnaround metric"), tag: "how" });
    await saveAnnotation(db, { sessionId, ...spanOf("rural clinic"), tag: "note", note: "who pays?" });
    await saveAnnotation(db, { sessionId, ...spanOf("any nurse can run"), tag: "constraint" });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.rows).toHaveLength(3);
    expect(await db.select().from(reconciliations)).toHaveLength(3);
  });

  it("matches an identical span and lets the human row take the model's place", async () => {
    const model = await modelSays("measure the cost the rural clinic pays", "purpose");
    const sessionId = await openSession();
    const saved = await saveAnnotation(db, {
      sessionId,
      ...spanOf("measure the cost the rural clinic pays"),
      tag: "intent",
    });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.counts.match).toBe(1);

    const [retired] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(retired.status).toBe("superseded");
    expect(retired.supersededBy).toBe(saved.assertionId);

    const [human] = await db.select().from(assertions).where(eq(assertions.id, saved.assertionId!));
    expect(human.status).toBe("active");
    expect(human.confidence).toBe("confirmed");
    expect(human.provenance).toMatchObject({
      reconciled_from: { assertion_id: model.id, extraction_run_id: runId },
    });
  });

  it("records the drift on a boundary and keeps the human span", async () => {
    const model = await modelSays("We measure the cost the rural clinic pays", "purpose");
    const sessionId = await openSession();
    const human = spanOf("measure the cost the rural clinic pays");
    const saved = await saveAnnotation(db, { sessionId, ...human, tag: "intent" });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.counts.boundary).toBe(1);

    const [row] = await db.select().from(reconciliations);
    expect(row.relation).toBe("boundary");
    expect(row.drift).toMatchObject({ human_span: [human.start, human.end] });
    expect(row.overlap).toBeGreaterThanOrEqual(0.5);

    const [retired] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(retired.supersededBy).toBe(saved.assertionId);
    const [active] = await db.select().from(assertions).where(eq(assertions.id, saved.assertionId!));
    expect([active.startOff, active.endOff]).toEqual([human.start, human.end]);
    expect(active.confidence).toBe("confirmed");
  });

  it("keeps both sides of a conflict and queues it", async () => {
    const model = await modelSays("a low-cost turnaround metric", "purpose");
    const sessionId = await openSession();
    const saved = await saveAnnotation(db, {
      sessionId,
      ...spanOf("a low-cost turnaround metric"),
      tag: "how",
    });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.counts.conflict).toBe(1);

    const rows = await db.select().from(assertions).where(eq(assertions.status, "active"));
    expect(rows.map((r) => r.id).sort()).toContain(model.id);
    expect(rows.map((r) => r.id).sort()).toContain(saved.assertionId);

    const queue = await reconciliationQueue(db);
    expect(queue.filter((q) => q.relation === "conflict")).toHaveLength(1);
  });

  it("records a miss with no model side", async () => {
    await modelSays("a low-cost turnaround metric", "mechanism");
    const sessionId = await openSession();
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "intent" });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.counts.miss).toBe(1);
    const [row] = await db.select().from(reconciliations);
    expect(row.modelAssertionId).toBeNull();
  });

  it("calls a same-facet graze a miss rather than a find", async () => {
    // Twenty tokens of model against three of human: they touch, but the
    // model did not find this.
    const model = await modelSays(
      "the cost the rural clinic pays for a diagnosis, using a low-cost turnaround metric that any nurse can run",
      "purpose",
    );
    const sessionId = await openSession();
    await saveAnnotation(db, { sessionId, ...spanOf("any nurse can run"), tag: "intent" });

    const summary = await reconcileSession(db, sessionId);
    expect(summary!.counts.miss).toBe(1);
    const [row] = await db.select().from(reconciliations);
    expect(row.modelAssertionId).toBeNull();
    expect(row.drift).toMatchObject({ grazed_model_assertion_id: model.id });

    const [untouched] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(untouched.status).toBe("active");
  });

  it("leaves a model assertion nobody highlighted exactly as it was", async () => {
    const model = await modelSays("a low-cost turnaround metric", "mechanism");
    const sessionId = await openSession("casual");
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "intent" });

    await reconcileSession(db, sessionId);

    const [row] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(row.status).toBe("active");
    expect(row.confidence).toBe("extracted");
    const rows = await db.select().from(reconciliations).where(eq(reconciliations.modelAssertionId, model.id));
    expect(rows).toHaveLength(0);
  });

  it("returns null for a session that does not exist", async () => {
    expect(await reconcileSession(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("resolveConflict", () => {
  it("supersedes the loser and leaves the queue", async () => {
    const model = await modelSays("a low-cost turnaround metric", "purpose");
    const sessionId = await openSession();
    const saved = await saveAnnotation(db, {
      sessionId,
      ...spanOf("a low-cost turnaround metric"),
      tag: "how",
    });
    await reconcileSession(db, sessionId);
    const [row] = await db.select().from(reconciliations);

    await resolveConflict(db, row.id, "human");

    const [loser] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(loser.status).toBe("superseded");
    expect(loser.supersededBy).toBe(saved.assertionId);
    const [resolved] = await db.select().from(reconciliations).where(eq(reconciliations.id, row.id));
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedFacet).toBe("mechanism");
    expect(await reconciliationQueue(db)).toHaveLength(0);
  });

  it("does nothing to a row that is not an unresolved conflict", async () => {
    const sessionId = await openSession();
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "intent" });
    await reconcileSession(db, sessionId);
    const [miss] = await db.select().from(reconciliations);
    await resolveConflict(db, miss.id, "human");
    const [after] = await db.select().from(reconciliations).where(eq(reconciliations.id, miss.id));
    expect(after.resolvedAt).toBeNull();
  });
});

describe("the annotations a session filed", () => {
  it("are all still there after reconciliation", async () => {
    const sessionId = await openSession();
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "intent" });
    await reconcileSession(db, sessionId);
    expect(await db.select().from(annotations)).toHaveLength(1);
  });
});
