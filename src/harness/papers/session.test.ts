import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, document, extractionRuns, readingSessions } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { NOT_STATED, ensurePerson, insertAssertion } from "../ledger";
import type { Facet, Provenance, ReadingMode } from "../schema";
import { saveAnnotation } from "./annotate";
import { completeArtifacts, goldenSet, listArtifacts, openReading } from "./reading";
import { ABSENCE_FACETS, endSession } from "./session";

const TEXT = "We measure the cost the rural clinic pays for a diagnosis, using a low-cost metric.";

let db: Db;
let artifactId: string;
let textHash: string;
let reader: string;

const noNotes = { classify: async () => null };

async function open(mode: ReadingMode) {
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId: reader, artifactId, textHash, mode })
    .returning({ id: readingSessions.id });
  return row.id;
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
});

describe("absence toggles", () => {
  it("write a confirmed not_stated row per checked facet", async () => {
    const sessionId = await open("exhaustive");
    const result = await endSession(db, sessionId, ["constraint", "evaluation"] as Facet[], noNotes);

    expect(result.ended).toBe(true);
    expect(result.absence.sort()).toEqual(["constraint", "evaluation"]);

    const rows = await db.select().from(assertions).where(eq(assertions.text, NOT_STATED));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.confidence).toBe("confirmed");
      expect(row.sourceType).toBe("annotation");
      expect(row.subjectType).toBe("paper");
      expect(row.subjectId).toBe(artifactId);
      expect(row.embedding).toBeNull();
      expect(row.provenance).toMatchObject({
        session_id: sessionId,
        reader_id: reader,
        text_hash: textHash,
      });
    }
  });

  it("are ignored in a casual sitting — absence is only an exhaustive claim", async () => {
    const sessionId = await open("casual");
    const result = await endSession(db, sessionId, ["constraint"] as Facet[], noNotes);
    expect(result.absence).toEqual([]);
    expect(await db.select().from(assertions).where(eq(assertions.text, NOT_STATED))).toHaveLength(0);
  });

  it("takes only the facets a reader can mark absent", async () => {
    const sessionId = await open("exhaustive");
    const result = await endSession(db, sessionId, ["domain", "evidence"] as Facet[], noNotes);
    expect(result.absence).toEqual([]);
    expect(ABSENCE_FACETS).toEqual(["purpose", "mechanism", "constraint", "evaluation"]);
  });

  it("does not write a second row when a later sitting agrees", async () => {
    await endSession(db, await open("exhaustive"), ["constraint"] as Facet[], noNotes);
    const second = await endSession(db, await open("exhaustive"), ["constraint"] as Facet[], noNotes);
    expect(second.absence).toEqual([]);
    expect(await db.select().from(assertions).where(eq(assertions.text, NOT_STATED))).toHaveLength(1);
  });
});

describe("ending a sitting", () => {
  it("happens once, however many times the button is pressed", async () => {
    const sessionId = await open("exhaustive");
    const first = await endSession(db, sessionId, ["constraint"] as Facet[], noNotes);
    const second = await endSession(db, sessionId, ["evaluation"] as Facet[], noNotes);

    expect(first.ended).toBe(true);
    expect(second.ended).toBe(false);
    expect(second.absence).toEqual([]);
    expect(await db.select().from(assertions).where(eq(assertions.text, NOT_STATED))).toHaveLength(1);
  });

  it("leaves a model assertion nobody highlighted exactly as it was", async () => {
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
    const quote = "a low-cost metric";
    const start = TEXT.indexOf(quote);
    const model = await insertAssertion(db, {
      subjectType: "paper",
      subjectId: artifactId,
      facet: "mechanism",
      text: quote,
      sourceType: "abstract",
      sourceArtifactId: artifactId,
      textHash,
      startOff: start,
      endOff: start + quote.length,
      quote,
      provenance: { kind: "document", document_id: artifactId } as Provenance,
      extractionRunId: run.id,
    });

    const sessionId = await open("exhaustive");
    await saveAnnotation(db, {
      sessionId,
      start: TEXT.indexOf("We measure"),
      end: TEXT.indexOf("We measure") + "We measure".length,
      selected: "We measure",
      tag: "intent",
    });
    await endSession(db, sessionId, [], noNotes);

    const [after] = await db.select().from(assertions).where(eq(assertions.id, model.id));
    expect(after.status).toBe("active");
    expect(after.confidence).toBe("extracted");
  });
});

describe("what counts as complete", () => {
  it("is exhaustive and ended, and nothing else", async () => {
    const casual = await open("casual");
    await endSession(db, casual, [], noNotes);
    expect(await completeArtifacts(db)).toEqual(new Set());

    const open1 = await open("exhaustive");
    expect(await completeArtifacts(db)).toEqual(new Set());

    await endSession(db, open1, [], noNotes);
    expect(await completeArtifacts(db)).toEqual(new Set([artifactId]));
  });

  it("counts artifacts, not sittings", async () => {
    await endSession(db, await open("exhaustive"), [], noNotes);
    await endSession(db, await open("exhaustive"), [], noNotes);

    const golden = await goldenSet(db);
    expect(golden.n).toBe(1);
    expect(golden.target).toBe(50);
    expect(golden.missing).toEqual([]);
  });

  it("lists the artifacts still without a complete reading", async () => {
    const golden = await goldenSet(db);
    expect(golden.n).toBe(0);
    expect(golden.missing.map((m) => m.artifactId)).toEqual([artifactId]);
  });
});

describe("the artifact list", () => {
  it("counts the annotations standing on each text", async () => {
    const sessionId = await openReading(db, artifactId, "casual");
    const start = TEXT.indexOf("We measure");
    await saveAnnotation(db, {
      sessionId,
      start,
      end: start + "We measure".length,
      selected: "We measure",
      tag: "intent",
    });

    const [row] = await listArtifacts(db);
    expect(row.annotationCount).toBe(1);
    expect(row.preview.length).toBeLessThanOrEqual(200);
    expect(row.complete).toBe(false);
    expect(row.sourceFormat).toBe("abstract");
  });

  it("writes the mode the link asked for, at creation", async () => {
    const sessionId = await openReading(db, artifactId, "exhaustive");
    const [row] = await db
      .select()
      .from(readingSessions)
      .where(and(eq(readingSessions.id, sessionId), eq(readingSessions.mode, "exhaustive")));
    expect(row.readerId).toBe(reader);
    expect(row.textHash).toBe(textHash);
  });
});
