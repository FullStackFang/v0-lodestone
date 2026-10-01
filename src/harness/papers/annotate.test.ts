import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import {
  annotations,
  assertions,
  document,
  readingSessions,
  reconciliations,
  session,
} from "@/db/schema";
import { putArtifactText } from "../canonical";
import { ensurePerson } from "../ledger";
import {
  AnnotationReferenced,
  SliceMismatch,
  UnknownTag,
  deleteAnnotation,
  saveAnnotation,
  subjectOf,
  tagMapping,
} from "./annotate";

const PAPER =
  "We measure the cost the rural clinic pays for a diagnosis, using a low-cost turnaround metric.";
const RESUME = "Shipped a scheduling tool to nine clinics and cut no-shows by a fifth.";

let db: Db;
let paperArtifact: string;
let paperHash: string;
let resumeArtifact: string;
let resumeHash: string;
let reader: string;
let classmate: string;

/** A reading session over an artifact by a reader. */
async function openSession(readerId: string, artifactId: string, textHash: string, mode: "casual" | "exhaustive" = "casual") {
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId, artifactId, textHash, mode })
    .returning({ id: readingSessions.id });
  return row.id;
}

/** `[start, end)` of a quote inside a text, as the client would compute it. */
const spanOf = (text: string, quote: string) => {
  const start = text.indexOf(quote);
  return { start, end: start + quote.length, selected: quote };
};

beforeAll(async () => {
  db = await createPgliteDb();
  reader = await ensurePerson(db, { name: "The reader", email: "reader@harness.local" });
  classmate = await ensurePerson(db, { name: "A classmate", email: "classmate@school.edu" });

  const [paperDoc] = await db
    .insert(document)
    .values({ source: "paper", title: "A paper", text: PAPER })
    .returning({ id: document.id });
  paperArtifact = paperDoc.id;
  paperHash = (
    await putArtifactText(db, {
      artifactId: paperArtifact,
      sourceFormat: "abstract",
      parser: "test-v1",
      text: PAPER,
      provenance: { field: "Medicine" },
    })
  ).textHash;

  const [classmateSession] = await db
    .insert(session)
    .values({ personId: classmate })
    .returning({ id: session.id });
  const [resumeDoc] = await db
    .insert(document)
    .values({ sessionId: classmateSession.id, source: "resume", title: "A resume", text: RESUME })
    .returning({ id: document.id });
  resumeArtifact = resumeDoc.id;
  resumeHash = (
    await putArtifactText(db, {
      artifactId: resumeArtifact,
      sourceFormat: "resume",
      parser: "test-v1",
      text: RESUME,
    })
  ).textHash;
});

describe("the map decides what a tag files", () => {
  it("resolves intent to purpose@specific and files it confirmed on the paper", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "measure the cost the rural clinic pays");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "intent" });

    expect(result.assertionId).not.toBeNull();
    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.facet).toBe("purpose");
    expect(row.abstractionLevel).toBe("specific");
    expect(row.quote).toBe(span.selected);
    expect(row.text).toBe(span.selected);
    expect(row.subjectType).toBe("paper");
    expect(row.subjectId).toBe(paperArtifact);
    expect(row.confidence).toBe("confirmed");
    expect(row.sourceType).toBe("annotation");
    expect(row.provenance).toMatchObject({
      kind: "annotation",
      annotation_id: result.annotation.id,
      session_id: sessionId,
      reader_id: reader,
      text_hash: paperHash,
    });
    // The contract recomputes prefix and suffix from the text it owns.
    expect(PAPER.slice(row.startOff!, row.endOff!)).toBe(span.selected);
    expect(result.annotation.assertionId).toBe(result.assertionId);
  });

  it("resolves how + revenue to mechanism.revenue", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "a low-cost turnaround metric");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "how", subtype: "revenue" });
    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.facet).toBe("mechanism.revenue");
  });

  it("resolves how alone to the untyped mechanism, never to a product", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "using a low-cost turnaround metric");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "how" });
    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.facet).toBe("mechanism");
  });

  it("files an insight with no facet at all", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "for a diagnosis");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "insight" });
    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.facet).toBeNull();
    expect(row.status).toBe("active");
  });

  it("writes no assertion for a note, because the row says so", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "rural clinic");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "note", note: "who pays?" });

    expect(result.assertionId).toBeNull();
    expect(result.skipped).toBe("map_says_no");
    expect(result.annotation.assertionId).toBeNull();
    expect(result.annotation.note).toBe("who pays?");
    // The map row, not a branch on the tag name.
    expect(await tagMapping(db, "note")).toMatchObject({ writesAssertion: false });
  });

  it("refuses a tag with no map row", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "clinic pays");
    await expect(saveAnnotation(db, { sessionId, ...span, tag: "vibes" })).rejects.toThrow(UnknownTag);
  });
});

describe("the quote must be the slice", () => {
  it("writes nothing when the offsets are stale", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const before = await db.select().from(annotations);
    const assertionsBefore = await db.select().from(assertions);

    await expect(
      saveAnnotation(db, { sessionId, start: 3, end: 10, selected: "not this", tag: "intent" }),
    ).rejects.toThrow(SliceMismatch);

    expect(await db.select().from(annotations)).toHaveLength(before.length);
    expect(await db.select().from(assertions)).toHaveLength(assertionsBefore.length);
  });
});

describe("the reader's relation to the subject decides the rung", () => {
  it("confirms a person's highlight on their own document", async () => {
    const sessionId = await openSession(classmate, resumeArtifact, resumeHash);
    const span = spanOf(RESUME, "Shipped a scheduling tool to nine clinics");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "how" });

    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.subjectType).toBe("person");
    expect(row.subjectId).toBe(classmate);
    expect(row.confidence).toBe("confirmed");
  });

  it("corroborates a classmate's document, on the classmate's subject", async () => {
    const sessionId = await openSession(reader, resumeArtifact, resumeHash);
    const span = spanOf(RESUME, "cut no-shows by a fifth");
    const result = await saveAnnotation(db, { sessionId, ...span, tag: "how" });

    const [row] = await db.select().from(assertions).where(eq(assertions.id, result.assertionId!));
    expect(row.subjectId).toBe(classmate);
    expect(row.subjectId).not.toBe(reader);
    expect(row.confidence).toBe("corroborated");
    expect(row.provenance).toMatchObject({ corroborated_by: result.annotation.id });
  });

  it("keeps the annotation but files nothing for a document with no person", async () => {
    const [legacySession] = await db.insert(session).values({}).returning({ id: session.id });
    const text = "A deck from before the person step.";
    const [doc] = await db
      .insert(document)
      .values({ sessionId: legacySession.id, source: "deck", title: "Legacy", text })
      .returning({ id: document.id });
    const put = await putArtifactText(db, {
      artifactId: doc.id,
      sourceFormat: "deck",
      parser: "test-v1",
      text,
    });

    expect(await subjectOf(db, doc.id)).toBeNull();
    const sessionId = await openSession(reader, doc.id, put.textHash);
    const result = await saveAnnotation(db, {
      sessionId,
      ...spanOf(text, "the person step"),
      tag: "intent",
    });
    expect(result.assertionId).toBeNull();
    expect(result.skipped).toBe("no_subject");
  });
});

describe("delete", () => {
  it("supersedes the assertion and hard-deletes the annotation", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "the cost the rural clinic pays");
    const saved = await saveAnnotation(db, { sessionId, ...span, tag: "constraint" });

    const { assertionId } = await deleteAnnotation(db, saved.annotation.id);
    expect(assertionId).toBe(saved.assertionId);

    expect(await db.select().from(annotations).where(eq(annotations.id, saved.annotation.id))).toHaveLength(0);
    const [row] = await db.select().from(assertions).where(eq(assertions.id, saved.assertionId!));
    expect(row.status).toBe("superseded");
    expect(row.supersededBy).toBeNull();
    expect(row.provenance).toMatchObject({ superseded_reason: "annotation_deleted" });
  });

  it("refuses while a reconciliation cites it, and names the row", async () => {
    const sessionId = await openSession(reader, paperArtifact, paperHash);
    const span = spanOf(PAPER, "a diagnosis, using a low-cost");
    const saved = await saveAnnotation(db, { sessionId, ...span, tag: "eval" });
    const [row] = await db
      .insert(reconciliations)
      .values({ sessionId, humanAnnotationId: saved.annotation.id, relation: "miss" })
      .returning({ id: reconciliations.id });

    await expect(deleteAnnotation(db, saved.annotation.id)).rejects.toThrow(AnnotationReferenced);
    await expect(deleteAnnotation(db, saved.annotation.id)).rejects.toMatchObject({
      reconciliationIds: [row.id],
    });
    // Still there, both of them.
    expect(await db.select().from(annotations).where(eq(annotations.id, saved.annotation.id))).toHaveLength(1);
    const [assertion] = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.id, saved.assertionId!), eq(assertions.status, "active")));
    expect(assertion).toBeDefined();
  });
});
