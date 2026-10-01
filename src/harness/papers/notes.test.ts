import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { annotations, assertions, document, extractionRuns, readingSessions } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { ensurePerson } from "../ledger";
import type { ExtractionRunRow } from "@/db/schema";
import { saveAnnotation } from "./annotate";
import { classifySessionNotes, readerQuestions } from "./notes";

const TEXT = "We measure the cost the rural clinic pays for a diagnosis, using a low-cost metric.";

let db: Db;
let artifactId: string;
let textHash: string;
let reader: string;
let sessionId: string;

const spanOf = (quote: string) => {
  const start = TEXT.indexOf(quote);
  return { start, end: start + quote.length, selected: quote };
};

/** A model that labels by a lookup the test controls, and counts its calls. */
function fakeModel(kinds: Record<string, "query" | "observation" | "other">) {
  const calls: string[] = [];
  const structured = (async (_schema: unknown, request: { prompt: string }) => {
    calls.push(request.prompt);
    const ids = [...request.prompt.matchAll(/id: ([0-9a-f-]{36})/g)].map((m) => m[1]);
    return {
      output: { labels: ids.map((id, at) => ({ annotationId: id, kind: kinds[String(at)] ?? "other" })) },
      model: "test:model",
      usage: null,
    };
  }) as never;
  return { structured, calls };
}

const noLadder = (async () => ({ id: "ladder-run" }) as unknown as ExtractionRunRow) as never;
const noEmbed = (async (texts: string[]) => ({
  vectors: texts.map(() => null),
  embedded: false,
  model: null,
  tokens: null,
})) as never;

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
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId: reader, artifactId, textHash, mode: "casual" })
    .returning({ id: readingSessions.id });
  sessionId = row.id;
});

describe("classifySessionNotes", () => {
  it("classifies a sitting's notes in one call and stores every label", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "note", note: "how would we measure this cheaply?" });
    await saveAnnotation(db, { sessionId, ...spanOf("rural clinic"), tag: "note", note: "small sample" });
    await saveAnnotation(db, { sessionId, ...spanOf("a low-cost metric"), tag: "note", note: "resume here" });

    const model = fakeModel({ "0": "query", "1": "observation", "2": "other" });
    const result = await classifySessionNotes(db, sessionId, {
      structured: model.structured,
      embed: noEmbed,
      ladder: noLadder,
    });

    expect(model.calls).toHaveLength(1);
    const rows = await db.select().from(annotations);
    expect(rows.map((r) => r.noteKind).sort()).toEqual(["observation", "other", "query"]);
    expect(rows.every((r) => r.notePromptVersion !== null)).toBe(true);
    expect(result!.purposeIds).toHaveLength(1);
  });

  it("files a query as the reader's purpose, with no hash and no selectors", async () => {
    await saveAnnotation(db, {
      sessionId,
      ...spanOf("for a diagnosis"),
      tag: "note",
      note: "we have no cheap way to know who no-shows",
    });

    const model = fakeModel({ "0": "query" });
    const result = await classifySessionNotes(db, sessionId, {
      structured: model.structured,
      embed: noEmbed,
      ladder: noLadder,
    });

    const [row] = await db.select().from(assertions).where(eq(assertions.id, result!.purposeIds[0]));
    expect(row.subjectType).toBe("person");
    expect(row.subjectId).toBe(reader);
    expect(row.facet).toBe("purpose");
    expect(row.abstractionLevel).toBe("specific");
    expect(row.confidence).toBe("confirmed");
    expect(row.sourceType).toBe("annotation");
    expect(row.text).toBe("we have no cheap way to know who no-shows");
    // A question is not a slice of the abstract.
    expect(row.textHash).toBeNull();
    expect(row.startOff).toBeNull();
    expect(row.quote).toBeNull();
    expect(row.provenance).toMatchObject({
      kind: "annotation",
      artifact_id: artifactId,
      context_text_hash: textHash,
      context_quote: "for a diagnosis",
    });

    expect(await readerQuestions(db, reader)).toHaveLength(1);
  });

  it("writes nothing for an observation", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "note", note: "small sample" });
    const model = fakeModel({ "0": "observation" });
    const result = await classifySessionNotes(db, sessionId, {
      structured: model.structured,
      embed: noEmbed,
      ladder: noLadder,
    });
    expect(result!.purposeIds).toHaveLength(0);
    expect(await db.select().from(assertions)).toHaveLength(0);
  });

  it("makes no call at all when the sitting has no notes", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "intent" });
    const model = fakeModel({});
    expect(
      await classifySessionNotes(db, sessionId, {
        structured: model.structured,
        embed: noEmbed,
        ladder: noLadder,
      }),
    ).toBeNull();
    expect(model.calls).toHaveLength(0);
  });

  it("leaves the notes unlabelled when the call fails", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "note", note: "?" });
    const failing = (async () => {
      throw new Error("no model");
    }) as never;
    expect(
      await classifySessionNotes(db, sessionId, { structured: failing, embed: noEmbed, ladder: noLadder }),
    ).toBeNull();
    const [row] = await db.select().from(annotations);
    expect(row.noteKind).toBeNull();
  });

  it("ignores a label for an annotation it did not send", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "note", note: "?" });
    const inventing = (async () => ({
      output: { labels: [{ annotationId: "00000000-0000-4000-8000-000000000000", kind: "query" }] },
      model: "test:model",
      usage: null,
    })) as never;
    const result = await classifySessionNotes(db, sessionId, {
      structured: inventing,
      embed: noEmbed,
      ladder: noLadder,
    });
    expect(result!.labels).toHaveLength(0);
    expect(await db.select().from(assertions)).toHaveLength(0);
  });

  it("puts the reader's questions on a run of their own", async () => {
    await saveAnnotation(db, { sessionId, ...spanOf("We measure"), tag: "note", note: "how cheaply?" });
    const model = fakeModel({ "0": "query" });
    await classifySessionNotes(db, sessionId, {
      structured: model.structured,
      embed: noEmbed,
      ladder: noLadder,
    });
    const runs = await db.select().from(extractionRuns).where(eq(extractionRuns.variant, "note-classify"));
    expect(runs).toHaveLength(1);
    expect(runs[0].textHash).toBe(textHash);
  });
});
