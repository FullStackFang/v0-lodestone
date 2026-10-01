import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, extractionRuns } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { EMBEDDING_DIMENSIONS, type EmbedResult } from "../embed";
import type { ExtractionOutput } from "../schema";
import { extract, runModel } from "./core";
import { ladder, type LadderOutput } from "./ladder";

const ABSTRACT = "We present a triage system. The pilot cuts the time to a diagnosis from days to hours.";
const IDEA = "30000000-0000-4000-8000-000000000001";
const ARTIFACT = "30000000-0000-4000-8000-0000000000aa";

const VARIANT = path.join(process.cwd(), "prompts", "extract", "__test_ladder_src.md");
const LADDER = path.join(process.cwd(), "prompts", "extract", "ladder.md");
const originalLadder = readFileSync(LADDER, "utf8");

let db: Db;
let textHash: string;

beforeAll(async () => {
  writeFileSync(VARIANT, "# A source variant\n", "utf8");
  db = await createPgliteDb();
  ({ textHash } = await putArtifactText(db, {
    artifactId: ARTIFACT,
    sourceFormat: "abstract",
    parser: "test-v1",
    text: ABSTRACT,
  }));
});

afterAll(() => {
  rmSync(VARIANT, { force: true });
  writeFileSync(LADDER, originalLadder, "utf8");
});

beforeEach(async () => {
  await db.delete(assertions);
  await db.delete(extractionRuns);
  writeFileSync(LADDER, originalLadder, "utf8");
});

const embed = vi.fn(async (texts: string[]): Promise<EmbedResult> => ({
  vectors: texts.map((_, i) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, d) => (d === i ? 1 : 0))),
  embedded: true,
  model: "voyage-3.5",
  tokens: texts.length,
})) as never;

const SOURCE: ExtractionOutput = {
  assertions: [
    {
      facet: "purpose",
      text: "reduce time to diagnosis in rural clinics",
      quote: "cuts the time to a diagnosis",
      prefix: "The pilot",
      subject: "idea",
    },
  ],
  not_stated: [],
};

const RUNGS: LadderOutput = {
  rungs: [
    { of: 0, abstraction_level: "abstract", text: "reduce the delay between a signal and a decision" },
    { of: 0, abstraction_level: "core", text: "act sooner on incomplete information" },
  ],
};

/** A source run with one `purpose@specific` row. */
async function sourceRun(idea = IDEA, force = false) {
  return extract(
    db,
    { textHash, variant: "__test_ladder_src", subjects: { idea }, sourceArtifactId: ARTIFACT, force },
    { structured: vi.fn(async () => ({ output: SOURCE, model: "fake", usage: null })) as never, embed },
  );
}

function ladderModel(output: LadderOutput = RUNGS) {
  return vi.fn(async () => ({ output, model: "fake", usage: { output_tokens: 5 } })) as never;
}

describe("ladder", () => {
  it("is a run of its own, hashed on ladder.md alone", async () => {
    const source = await sourceRun();
    const run = await ladder(db, source.id, { structured: ladderModel(), embed });
    expect(run.status).toBe("ok");
    expect(run.variant).toBe("ladder");
    expect(run.textHash).toBe(source.textHash);
    expect(run.model).toBe(source.model);
    expect(run.promptVersion).toBe(run.coreVersion);
    expect(run.promptVersion).not.toBe(source.promptVersion);
  });

  it("records the engine that lifted the rungs, not a model-free source's `none`", async () => {
    const [none] = await db
      .insert(extractionRuns)
      .values({
        textHash,
        variant: "forge",
        promptVersion: "table-v1",
        coreVersion: "none",
        model: "none",
        attributionKey: "forge:test",
        status: "ok",
      })
      .returning();
    await db.insert(assertions).values({
      subjectType: "idea",
      subjectId: IDEA,
      facet: "purpose",
      abstractionLevel: "specific",
      text: "nurses swap night shifts peer to peer",
      sourceType: "canvas",
      provenance: { kind: "forge", idea_id: "i", framework: "business_model", key: "k", block: "value_proposition" },
      extractionRunId: none.id,
    });
    const run = await ladder(db, none.id, { structured: ladderModel(), embed });
    expect(run.status).toBe("ok");
    expect(run.model).toBe(runModel());
    expect(run.model).not.toBe("none");
  });

  it("files abstract and core rows anchored to the specific row, with no selectors", async () => {
    const source = await sourceRun();
    const [specific] = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.extractionRunId, source.id), eq(assertions.abstractionLevel, "specific")));

    const run = await ladder(db, source.id, { structured: ladderModel(), embed });
    const rungs = await db.select().from(assertions).where(eq(assertions.extractionRunId, run.id));
    expect(rungs.map((r) => r.abstractionLevel).sort()).toEqual(["abstract", "core"]);
    for (const rung of rungs) {
      expect(rung.textHash).toBeNull();
      expect(rung.quote).toBeNull();
      expect(rung.facet).toBe("purpose");
      expect(rung.confidence).toBe("extracted");
      expect(rung.subjectId).toBe(specific.subjectId);
      expect(rung.provenance).toEqual({ kind: "ladder", ladder_of: specific.id });
    }
  });

  it("is cached at one ladder.md — the model runs once", async () => {
    const source = await sourceRun();
    const structured = ladderModel();
    const first = await ladder(db, source.id, { structured, embed });
    const second = await ladder(db, source.id, { structured, embed });
    expect(second.id).toBe(first.id);
    expect(structured).toHaveBeenCalledTimes(1);
  });

  it("claims once when two passes race — one model call, one set of rungs", async () => {
    const source = await sourceRun();
    const structured = ladderModel();
    const [first, second] = await Promise.all([
      ladder(db, source.id, { structured, embed }),
      ladder(db, source.id, { structured, embed }),
    ]);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);

    const ladderRuns = await db.select().from(extractionRuns).where(eq(extractionRuns.variant, "ladder"));
    expect(ladderRuns).toHaveLength(1);
    const rungs = await db.select().from(assertions).where(eq(assertions.extractionRunId, first.id));
    expect(rungs.map((r) => r.abstractionLevel).sort()).toEqual(["abstract", "core"]);
  });

  it.each([["another-idea", false], [IDEA, true]] as const)(
    "anchors its own source run when duplicate text is extracted for %s (force %s)",
    async (idea, force) => {
      const firstSource = await sourceRun();
      const first = await ladder(db, firstSource.id, { structured: ladderModel(), embed });
      const secondSource = await sourceRun(idea, force);
      const second = await ladder(db, secondSource.id, { structured: ladderModel(), embed });
      expect(second.id).not.toBe(first.id);
      const [specific] = await db.select().from(assertions).where(eq(assertions.extractionRunId, secondSource.id));
      const rungs = await db.select().from(assertions).where(eq(assertions.extractionRunId, second.id));
      expect(rungs).toHaveLength(2);
      expect(rungs.every((row) => row.subjectId === idea && row.provenance.ladder_of === specific.id)).toBe(true);
    },
  );

  it("supersedes the earlier rungs when ladder.md changes, leaving the specific row alone", async () => {
    const source = await sourceRun();
    const first = await ladder(db, source.id, { structured: ladderModel(), embed });
    const firstRungs = await db.select().from(assertions).where(eq(assertions.extractionRunId, first.id));

    writeFileSync(LADDER, `${originalLadder}\n<!-- revised -->\n`, "utf8");
    const second = await ladder(db, source.id, {
      structured: ladderModel({
        rungs: [
          { of: 0, abstraction_level: "abstract", text: "shorten the loop from evidence to action" },
          { of: 0, abstraction_level: "core", text: "decide before certainty arrives" },
        ],
      }),
      embed,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.promptVersion).not.toBe(first.promptVersion);

    for (const old of firstRungs) {
      const [now] = await db.select().from(assertions).where(eq(assertions.id, old.id));
      expect(now.status).toBe("superseded");
      expect(now.supersededBy).not.toBeNull();
    }
    const [specific] = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.extractionRunId, source.id), eq(assertions.abstractionLevel, "specific")));
    expect(specific.status).toBe("active");
  });

  it("records a model failure on the run rather than throwing", async () => {
    const source = await sourceRun();
    const run = await ladder(db, source.id, {
      structured: vi.fn(async () => {
        throw new Error("claude timed out after 300s");
      }) as never,
      embed,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/timed out/);
  });

  it("finishes ok with nothing to lift when the source had no purposes", async () => {
    const empty = await extract(
      db,
      { textHash, variant: "__test_ladder_src", subjects: { idea: IDEA } },
      {
        structured: vi.fn(async () => ({
          output: { assertions: [], not_stated: ["purpose"] },
          model: "fake",
          usage: null,
        })) as never,
        embed,
      },
    );
    const run = await ladder(db, empty.id, { structured: ladderModel(), embed });
    expect(run.status).toBe("ok");
    expect(await db.select().from(assertions).where(eq(assertions.extractionRunId, run.id))).toHaveLength(0);
  });

  it("throws for a run id nobody wrote", async () => {
    await expect(
      ladder(db, "40000000-0000-4000-8000-000000000000", { structured: ladderModel(), embed }),
    ).rejects.toThrow(/no extraction run/);
  });
});
