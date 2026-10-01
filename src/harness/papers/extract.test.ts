import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, document, extractionRuns } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { NOT_STATED } from "../ledger";
import { addCost, costOf, extractPaper, newestRun, transferableInsight } from "./extract";

const TEXT =
  "We measure the cost the rural clinic pays for a diagnosis. We built a low-cost turnaround metric that any nurse can run. Accuracy was checked against 200 chart reviews.";

const INSIGHT = "A cheap proxy measured continuously beats an exact one measured rarely.";

let db: Db;
let artifactId: string;
let textHash: string;

/** A model that answers the `abstract` variant and the ladder, and counts
 *  every call so a cache hit is visible. */
function fakeModel() {
  const calls: string[] = [];
  const structured = (async (_schema: unknown, request: { system: string; prompt: string }) => {
    calls.push(request.prompt.slice(0, 20));
    if (request.prompt.startsWith("Purposes")) {
      return {
        output: {
          rungs: [
            { of: 0, abstraction_level: "abstract", text: "know a cost you cannot currently see" },
            { of: 0, abstraction_level: "core", text: "make the invisible measurable" },
            { of: 1, abstraction_level: "abstract", text: "put a measurement in untrained hands" },
            { of: 1, abstraction_level: "core", text: "move capability to the edge" },
          ],
        },
        model: "test:model",
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    }
    return {
      output: {
        assertions: [
          {
            facet: "purpose",
            abstraction_level: "specific",
            text: "measure what a rural clinic pays for a diagnosis",
            quote: "measure the cost the rural clinic pays for a diagnosis",
            prefix: "We",
            subject: "paper",
          },
          {
            facet: "purpose",
            abstraction_level: "specific",
            text: "let a nurse run the measurement",
            quote: "that any nurse can run",
            prefix: "turnaround metric",
            subject: "paper",
          },
          {
            facet: "mechanism",
            abstraction_level: "specific",
            text: "a low-cost turnaround metric",
            quote: "a low-cost turnaround metric",
            prefix: "We built",
            subject: "paper",
          },
          {
            facet: "evaluation",
            abstraction_level: "specific",
            text: "checked against 200 chart reviews",
            quote: "checked against 200 chart reviews",
            prefix: "Accuracy was",
            subject: "paper",
          },
        ],
        not_stated: ["mechanism.revenue", "mechanism.distribution", "constraint"],
        derived: { transferable_insight: INSIGHT },
      },
      model: "test:model",
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  }) as never;
  return { structured, calls };
}

const noEmbed = (async (texts: string[]) => ({
  vectors: texts.map(() => null),
  embedded: false,
  model: null,
  tokens: null,
})) as never;

beforeEach(async () => {
  db = await createPgliteDb();
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: "A paper", text: TEXT })
    .returning({ id: document.id });
  artifactId = doc.id;
  textHash = (
    await putArtifactText(db, { artifactId, sourceFormat: "abstract", parser: "test-v1", text: TEXT })
  ).textHash;
});

describe("extractPaper", () => {
  it("anchors every quote and files the paper as the subject", async () => {
    const model = fakeModel();
    const { run } = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });

    expect(run.status).toBe("ok");
    const stats = run.stats as { unanchored: number; ambiguous: number };
    expect(stats.unanchored).toBe(0);
    expect(stats.ambiguous).toBe(0);

    const rows = await db.select().from(assertions).where(eq(assertions.extractionRunId, run.id));
    const anchored = rows.filter((r) => r.text !== NOT_STATED);
    expect(anchored).toHaveLength(4);
    for (const row of anchored) {
      expect(row.subjectType).toBe("paper");
      expect(row.subjectId).toBe(artifactId);
      expect(TEXT.slice(row.startOff!, row.endOff!)).toBe(row.quote);
      expect(row.confidence).toBe("extracted");
    }
  });

  it("writes a not_stated row per declared absence, never embedded", async () => {
    const model = fakeModel();
    const { run } = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });

    const absent = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.extractionRunId, run.id), eq(assertions.text, NOT_STATED)));
    expect(absent.map((r) => r.facet).sort()).toEqual([
      "constraint",
      "mechanism.distribution",
      "mechanism.revenue",
    ]);
    expect(absent.every((r) => r.embedding === null)).toBe(true);
    // And no evaluation absence, because the abstract stated one.
    expect(absent.some((r) => r.facet === "evaluation")).toBe(false);
  });

  it("gives a method the untyped mechanism, not a product", async () => {
    const model = fakeModel();
    const { run } = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });
    const rows = await db.select().from(assertions).where(eq(assertions.extractionRunId, run.id));
    const mechanisms = rows.filter((r) => r.facet?.startsWith("mechanism") && r.text !== NOT_STATED);
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0].facet).toBe("mechanism");
  });
});

describe("the ladder", () => {
  it("lifts every specific purpose twice, on a run of its own", async () => {
    const model = fakeModel();
    const { run, ladderRun } = await extractPaper(
      db,
      textHash,
      {},
      { structured: model.structured, embed: noEmbed },
    );

    expect(ladderRun!.variant).toBe("ladder");
    expect(ladderRun!.promptVersion).not.toBe(run.promptVersion);

    const specifics = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.extractionRunId, run.id), eq(assertions.abstractionLevel, "specific")));
    expect(specifics.filter((r) => r.facet === "purpose")).toHaveLength(2);

    const rungs = await db.select().from(assertions).where(eq(assertions.extractionRunId, ladderRun!.id));
    expect(rungs.filter((r) => r.abstractionLevel === "abstract")).toHaveLength(2);
    expect(rungs.filter((r) => r.abstractionLevel === "core")).toHaveLength(2);

    const parents = new Set(specifics.filter((r) => r.facet === "purpose").map((r) => r.id));
    for (const rung of rungs) {
      expect(rung.facet).toBe("purpose");
      expect(rung.subjectId).toBe(artifactId);
      expect(parents.has((rung.provenance as { ladder_of?: string }).ladder_of ?? "")).toBe(true);
      // A rung is not in the text, so it carries no selectors.
      expect(rung.textHash).toBeNull();
    }
  });
});

describe("the transferable insight", () => {
  it("rides on the run and never becomes an assertion", async () => {
    const model = fakeModel();
    const { run } = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });

    const [stored] = await db.select().from(extractionRuns).where(eq(extractionRuns.id, run.id));
    expect(transferableInsight(stored)).toBe(INSIGHT);

    const rows = await db.select().from(assertions);
    expect(rows.some((r) => r.text === INSIGHT)).toBe(false);
  });

  it("is null for a run that recorded none", () => {
    expect(transferableInsight(null)).toBeNull();
    expect(transferableInsight({ derived: {} } as never)).toBeNull();
  });
});

describe("the batch's skip rule", () => {
  it("makes no model call the second time", async () => {
    const model = fakeModel();
    await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });
    const first = model.calls.length;
    expect(first).toBeGreaterThan(0);

    const again = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });
    expect(model.calls).toHaveLength(first);
    expect(again.cached).toBe(true);
  });

  it("re-runs a failed text at the next attempt", async () => {
    const failing = (async () => {
      throw new Error("the engine is not here");
    }) as never;
    const { run } = await extractPaper(db, textHash, {}, { structured: failing, embed: noEmbed });
    expect(run.status).toBe("failed");
    expect((await newestRun(db, textHash))!.status).toBe("failed");

    const model = fakeModel();
    const retried = await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });
    expect(retried.run.status).toBe("ok");
    expect(retried.run.attempt).toBe(2);
    expect(retried.cached).toBe(false);
  });

  it("makes a new attempt under --force", async () => {
    const model = fakeModel();
    await extractPaper(db, textHash, {}, { structured: model.structured, embed: noEmbed });
    const before = model.calls.length;
    const forced = await extractPaper(
      db,
      textHash,
      { force: true },
      { structured: model.structured, embed: noEmbed },
    );
    expect(model.calls.length).toBeGreaterThan(before);
    expect(forced.run.attempt).toBe(2);
  });
});

describe("cost", () => {
  it("reads unknown when a run recorded no usage, never zero", () => {
    expect(costOf(null)).toEqual({ tokens: null, cost: null });
    expect(costOf({ usage: null } as never)).toEqual({ tokens: null, cost: null });
    expect(costOf({ usage: { input_tokens: 3, output_tokens: 4 } } as never)).toEqual({
      tokens: 7,
      cost: null,
    });
  });

  it("adds a known part to an unknown one without inventing a total", () => {
    expect(addCost({ tokens: null, cost: null }, { tokens: null, cost: null })).toEqual({
      tokens: null,
      cost: null,
    });
    expect(addCost({ tokens: 5, cost: "$0.0100" }, { tokens: null, cost: null })).toEqual({
      tokens: 5,
      cost: "$0.0100",
    });
  });
});
