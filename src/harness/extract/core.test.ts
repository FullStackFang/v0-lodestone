import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, extractionRuns } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { EMBEDDING_DIMENSIONS, type EmbedResult } from "../embed";
import { InvalidOutput, NoModel } from "../model";
import type { ExtractionOutput } from "../schema";
import { UnknownText, extract, runAssertions, runModel } from "./core";

const ABSTRACT =
  "We present a triage system for rural clinics. The system cuts the time to a diagnosis from days to hours. " +
  "The system was piloted in eleven clinics over six weeks.";

let db: Db;
let textHash: string;
const IDEA = "20000000-0000-4000-8000-000000000001";
const ARTIFACT = "20000000-0000-4000-8000-0000000000aa";

beforeAll(async () => {
  db = await createPgliteDb();
  ({ textHash } = await putArtifactText(db, {
    artifactId: ARTIFACT,
    sourceFormat: "abstract",
    parser: "test-v1",
    text: ABSTRACT,
  }));
});

/** A fake `structured` that returns a canned `ExtractionOutput`. */
function model(output: ExtractionOutput, usage: Record<string, unknown> | null = { output_tokens: 10 }) {
  return vi.fn(async () => ({ output, model: "fake", usage })) as never;
}

const vector = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === seed ? 1 : 0));

/** A fake embedder that always answers. */
function embedder(): { fn: never; calls: string[][] } {
  const calls: string[][] = [];
  const fn = vi.fn(async (texts: string[]): Promise<EmbedResult> => {
    calls.push(texts);
    return {
      vectors: texts.map((_, i) => vector(i)),
      embedded: true,
      model: "voyage-3.5",
      tokens: texts.length,
    };
  }) as never;
  return { fn, calls };
}

/** A fake embedder with no key behind it. */
const noKey = vi.fn(async (texts: string[]): Promise<EmbedResult> => ({
  vectors: texts.map(() => null),
  embedded: false,
  model: null,
  tokens: null,
})) as never;

const OUTPUT: ExtractionOutput = {
  assertions: [
    {
      facet: "purpose",
      text: "reduce time to diagnosis",
      quote: "cuts the time to a diagnosis",
      prefix: "The system",
      subject: "idea",
    },
    {
      facet: "mechanism.product",
      text: "a triage system",
      quote: "a triage system for rural clinics",
      prefix: "We present",
      subject: "idea",
    },
    {
      facet: "evidence",
      text: "piloted in eleven clinics",
      quote: "piloted in eleven clinics over six weeks",
      prefix: "The system was",
      subject: "idea",
      evidence_type: "observed_behavior",
    },
  ],
  not_stated: ["mechanism.revenue"],
};

const input = (over: Record<string, unknown> = {}) => ({
  textHash,
  variant: "__test_abstract",
  subjects: { idea: IDEA },
  sourceArtifactId: ARTIFACT,
  ...over,
});

import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const VARIANT = path.join(process.cwd(), "prompts", "extract", "__test_abstract.md");

beforeAll(() => {
  writeFileSync(VARIANT, "# The abstract variant\nRead the abstract.\n", "utf8");
  return () => rmSync(VARIANT, { force: true });
});

beforeEach(async () => {
  await db.delete(assertions);
  await db.delete(extractionRuns);
});

describe("extract — bookkeeping", () => {
  it("throws UnknownText and writes no run for a hash nobody put", async () => {
    await expect(extract(db, input({ textHash: "0".repeat(64) }), { structured: model(OUTPUT) })).rejects.toBeInstanceOf(
      UnknownText,
    );
    expect(await db.select().from(extractionRuns)).toHaveLength(0);
  });

  it("throws for an unknown variant, before claiming anything", async () => {
    await expect(extract(db, input({ variant: "nonesuch" }), { structured: model(OUTPUT) })).rejects.toThrow(
      /nonesuch/,
    );
    expect(await db.select().from(extractionRuns)).toHaveLength(0);
  });

  it("writes one ok run with its assertions, and the second call is free", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const first = await extract(db, input(), { structured, embed });
    expect(first.status).toBe("ok");
    expect(first.model).toBe(runModel());
    expect(first.attempt).toBe(1);
    expect(first.finishedAt).not.toBeNull();

    const second = await extract(db, input(), { structured, embed });
    expect(second.id).toBe(first.id);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
  });

  it("gives two concurrent callers one model call and one run id", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const [a, b] = await Promise.all([
      extract(db, input(), { structured, embed }),
      extract(db, input(), { structured, embed }),
    ]);
    expect(a.id).toBe(b.id);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
  });

  it("shares an already pending run instead of starting another attempt", async () => {
    let started!: () => void;
    let finish!: () => void;
    const inModel = new Promise<void>((resolve) => { started = resolve; });
    const release = new Promise<void>((resolve) => { finish = resolve; });
    const structured = vi.fn(async () => {
      started();
      await release;
      return { output: OUTPUT, model: "fake", usage: null };
    }) as never;
    const first = extract(db, input(), { structured, embed: noKey });
    await Promise.race([inModel, first]);
    let pending;
    try {
      // Start after the first claim exists, not only in the same event-loop turn.
      pending = await extract(db, input(), { structured: model(OUTPUT), embed: noKey });
    } finally {
      finish();
    }
    const completed = await first;
    expect(pending.id).toBe(completed.id);
    expect(pending.status).toBe("pending");
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
  });

  it("retries a failed run at a new attempt without force", async () => {
    const dead = vi.fn(async () => {
      throw new NoModel("no engine here");
    }) as never;
    const failed = await extract(db, input(), { structured: dead, embed: noKey });
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/no engine here/);
    expect(failed.attempt).toBe(1);

    const { fn: embed } = embedder();
    const retried = await extract(db, input(), { structured: model(OUTPUT), embed });
    expect(retried.status).toBe("ok");
    expect(retried.attempt).toBe(2);
    expect(retried.id).not.toBe(failed.id);
  });

  it("makes force a new attempt and leaves the earlier run and its rows alone", async () => {
    const { fn: embed } = embedder();
    const first = await extract(db, input(), { structured: model(OUTPUT), embed });
    const firstRows = await runAssertions(db, first.id);
    const forced = await extract(db, input({ force: true }), { structured: model(OUTPUT), embed });

    expect(forced.id).not.toBe(first.id);
    expect(forced.attempt).toBe(2);
    const [before] = await db.select().from(extractionRuns).where(eq(extractionRuns.id, first.id));
    expect(before.status).toBe("ok");
    expect(await runAssertions(db, first.id)).toHaveLength(firstRows.length);
  });

  it("allocates separate attempts for concurrent explicit reruns", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const first = await extract(db, input(), { structured, embed });
    const forced = await Promise.all([
      extract(db, input({ force: true }), { structured, embed }),
      extract(db, input({ force: true }), { structured, embed }),
    ]);
    expect(forced.map((run) => run.attempt).sort()).toEqual([2, 3]);
    expect(new Set([first.id, ...forced.map((run) => run.id)]).size).toBe(3);
    expect(structured).toHaveBeenCalledTimes(3);
  });

  it("retries once on invalid output and marks the run failed on the second miss", async () => {
    const always = vi.fn(async () => {
      throw new InvalidOutput("nope", "  - facet: bad value");
    }) as never;
    const run = await extract(db, input(), { structured: always, embed: noKey });
    expect(run.status).toBe("failed");
    expect(run.error).toBe("invalid_output");
    expect(always).toHaveBeenCalledTimes(2);
  });

  it("passes the issues back on the retry and succeeds", async () => {
    let call = 0;
    const flaky = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new InvalidOutput("nope", "  - facet: bad value");
      return { output: OUTPUT, model: "fake", usage: { output_tokens: 7 } };
    }) as never;
    const { fn: embed } = embedder();
    const run = await extract(db, input(), { structured: flaky, embed });
    expect(run.status).toBe("ok");
    expect((flaky as unknown as { mock: { calls: [unknown, { prompt: string }][] } }).mock.calls[1][1].prompt).toMatch(
      /did not validate/,
    );
  });

  it("records a timeout as a failed run and does not throw", async () => {
    const slow = vi.fn(async () => {
      throw new Error("claude timed out after 300s");
    }) as never;
    const run = await extract(db, input(), { structured: slow, embed: noKey });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/timed out/);
  });

  it("refuses the CLI engine on Vercel, as a failed run rather than a throw", async () => {
    const run = await extract(db, input(), {
      structured: vi.fn(async () => {
        throw new NoModel("the CLI engine cannot run on Vercel");
      }) as never,
      embed: noKey,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Vercel/);
  });
});

describe("extract — what it files", () => {
  it("anchors every quote and writes selectors that slice back", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), { structured: model(OUTPUT), embed });
    const rows = await runAssertions(db, run.id);
    const anchored = rows.filter((r) => r.textHash !== null);
    expect(anchored).toHaveLength(3);
    for (const row of anchored) {
      expect(ABSTRACT.slice(row.startOff!, row.endOff!)).toBe(row.quote);
      expect(row.prefix).not.toBeNull();
    }
    const evidence = rows.find((r) => r.facet === "evidence")!;
    expect(evidence.evidenceType).toBe("observed_behavior");
  });

  it("writes not_stated as a row with no selectors and no vector", async () => {
    const { fn: embed, calls } = embedder();
    const run = await extract(db, input(), { structured: model(OUTPUT), embed });
    const rows = await runAssertions(db, run.id);
    const notStated = rows.find((r) => r.text === "not_stated")!;
    expect(notStated.facet).toBe("mechanism.revenue");
    expect(notStated.embedding).toBeNull();
    expect(notStated.textHash).toBeNull();
    // It never reached the provider.
    expect(calls[0]).not.toContain("not_stated");
    expect(calls[0]).toHaveLength(3);
  });

  it("drops an invented quote and counts it unanchored", async () => {
    const { fn: embed } = embedder();
    const run = await extract(
      db,
      input(),
      {
        structured: model({
          assertions: [
            {
              facet: "purpose",
              text: "cure everything",
              quote: "a claim the abstract never made",
              prefix: "We present",
              subject: "idea",
            },
          ],
          not_stated: [],
        }),
        embed,
      },
    );
    expect(run.status).toBe("ok");
    expect((run.stats as { unanchored: number }).unanchored).toBe(1);
    expect(await runAssertions(db, run.id)).toHaveLength(0);
  });

  it("drops a repeated quote with no usable prefix and counts it ambiguous", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), {
      structured: model({
        assertions: [
          { facet: "purpose", text: "the system", quote: "The system", prefix: "", subject: "idea" },
        ],
        not_stated: [],
      }),
      embed,
    });
    expect((run.stats as { ambiguous: number }).ambiguous).toBe(1);
    expect(await runAssertions(db, run.id)).toHaveLength(0);
  });

  it("drops a row whose subject has no id and counts it invalid", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), {
      structured: model({
        assertions: [
          {
            facet: "purpose",
            text: "the reader's own goal",
            quote: "cuts the time to a diagnosis",
            prefix: "The system",
            subject: "person",
          },
        ],
        not_stated: [],
      }),
      embed,
    });
    expect((run.stats as { dropped_invalid: number }).dropped_invalid).toBe(1);
  });

  it("reports distinct over count per facet", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), {
      structured: model({
        assertions: [
          { facet: "purpose", text: "reduce time", quote: "cuts the time to a diagnosis", prefix: "The system", subject: "idea" },
          { facet: "purpose", text: "Reduce  time", quote: "a triage system for rural clinics", prefix: "We present", subject: "idea" },
          { facet: "purpose", text: "shorten the wait", quote: "piloted in eleven clinics over six weeks", prefix: "The system was", subject: "idea" },
        ],
        not_stated: ["mechanism.revenue"],
      }),
      embed,
    });
    const stats = run.stats as Record<string, { count: number; distinct: number; not_stated: number }>;
    expect(stats.purpose.count).toBe(3);
    // "reduce time" and "Reduce  time" are one phrasing.
    expect(stats.purpose.distinct).toBe(2);
    expect(stats["mechanism.revenue"].not_stated).toBe(1);
    expect(stats["mechanism.revenue"].count).toBe(0);
  });

  it("stores derived on the run and files no assertion for it", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), {
      structured: model({ ...OUTPUT, derived: { transferable_insight: "latency is the product" } }),
      embed,
    });
    expect(run.derived).toEqual({ transferable_insight: "latency is the product" });
    const rows = await runAssertions(db, run.id);
    expect(rows.some((r) => r.text.includes("latency is the product"))).toBe(false);
  });
});

describe("extract — embeddings", () => {
  it("writes null vectors with no key and says so, without throwing", async () => {
    const run = await extract(db, input(), { structured: model(OUTPUT), embed: noKey });
    expect(run.status).toBe("ok");
    expect((run.stats as { embedded: boolean }).embedded).toBe(false);
    const rows = await runAssertions(db, run.id);
    expect(rows.every((r) => r.embedding === null && r.embeddingModel === null)).toBe(true);
  });

  it("embeds a cached run's rows when the key arrives later", async () => {
    const structured = model(OUTPUT);
    const first = await extract(db, input(), { structured, embed: noKey });
    expect((first.stats as { embedded: boolean }).embedded).toBe(false);

    const { fn: embed, calls } = embedder();
    const second = await extract(db, input(), { structured, embed });
    expect(second.id).toBe(first.id);
    expect(structured).toHaveBeenCalledTimes(1);
    expect((second.stats as { embedded: boolean }).embedded).toBe(true);
    expect(calls[0]).not.toContain("not_stated");

    const rows = await runAssertions(db, second.id);
    const stated = rows.filter((r) => r.text !== "not_stated");
    expect(stated.every((r) => r.embedding !== null && r.embeddingModel === "voyage-3.5")).toBe(true);
    expect(rows.find((r) => r.text === "not_stated")!.embedding).toBeNull();
    expect((second.usage as { embedding_tokens: number }).embedding_tokens).toBe(3);
  });

  it("leaves the run ok when the embedder is already satisfied", async () => {
    const { fn: embed } = embedder();
    const first = await extract(db, input(), { structured: model(OUTPUT), embed });
    const again = await extract(db, input(), { structured: model(OUTPUT), embed });
    expect(again.id).toBe(first.id);
    // Nothing to re-embed: the second call did not touch the provider.
    expect((embed as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

describe("extract — the run key", () => {
  it("files identical document text separately for each founder and idea", async () => {
    const structured = model({
      ...OUTPUT,
      assertions: [...OUTPUT.assertions, { ...OUTPUT.assertions[0], facet: "mechanism_commanded", subject: "person" }],
    });
    const { fn: embed } = embedder();
    const owners = [
      { idea: IDEA, person: "founder-one" },
      { idea: "another-idea", person: "founder-two" },
    ];
    const first = await extract(db, input({ subjects: owners[0] }), { structured, embed });
    const second = await extract(db, input({ subjects: owners[1] }), { structured, embed });

    expect(second.id).not.toBe(first.id);
    expect(second.attempt).toBe(1);
    for (const [index, run] of [first, second].entries()) {
      const rows = await runAssertions(db, run.id);
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.subjectId === owners[index][row.subjectType as "idea" | "person"])).toBe(true);
    }
    expect((await extract(db, input({ subjects: owners[1] }), { structured, embed })).id).toBe(second.id);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it("does not cross attribution boundaries when duplicate text arrives concurrently", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const [first, second] = await Promise.all([
      extract(db, input(), { structured, embed }),
      extract(db, input({ subjects: { idea: "concurrent-other-idea" } }), { structured, embed }),
    ]);
    expect(second.id).not.toBe(first.id);
    expect([first.attempt, second.attempt]).toEqual([1, 1]);
    expect((await runAssertions(db, second.id)).every((row) => row.subjectId === "concurrent-other-idea")).toBe(true);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it("separates source identity and provenance even when text and subjects match", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const runs = [];
    for (const source of [
      { sourceArtifactId: ARTIFACT, sourceType: "deck", provenance: { kind: "document", document_id: ARTIFACT, revision: 1 } },
      { sourceArtifactId: "second-upload", sourceType: "deck", provenance: { kind: "document", document_id: "second-upload", revision: 1 } },
      { sourceArtifactId: "second-upload", sourceType: "resume", provenance: { kind: "document", document_id: "second-upload", revision: 1 } },
      { sourceArtifactId: "second-upload", sourceType: "resume", provenance: { kind: "document", document_id: "second-upload", revision: 2 } },
    ]) {
      const run = await extract(db, input(source), { structured, embed });
      runs.push(run);
      expect((await runAssertions(db, run.id)).every((row) =>
        row.sourceArtifactId === source.sourceArtifactId && row.sourceType === source.sourceType && row.provenance.revision === source.provenance.revision,
      )).toBe(true);
    }
    expect(new Set(runs.map((run) => run.id)).size).toBe(4);
    const cached = await extract(db, input({
      sourceArtifactId: "second-upload", sourceType: "resume",
      provenance: { revision: 2, document_id: "second-upload", kind: "document" },
    }), { structured, embed });
    expect(cached.id).toBe(runs[3].id);
    expect(structured).toHaveBeenCalledTimes(4);
  });

  it("does not reuse a legacy run whose attribution is unknown", async () => {
    const structured = model(OUTPUT);
    const { fn: embed } = embedder();
    const old = await extract(db, input(), { structured, embed });
    await db.update(extractionRuns).set({ attributionKey: "" }).where(eq(extractionRuns.id, old.id));
    const current = await extract(db, input(), { structured, embed });
    expect(current.id).not.toBe(old.id);
    expect(await runAssertions(db, old.id)).toHaveLength(4);
    expect(await runAssertions(db, current.id)).toHaveLength(4);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it("separates two variants over the same text", async () => {
    const other = path.join(process.cwd(), "prompts", "extract", "__test_other.md");
    writeFileSync(other, "# Another variant\n", "utf8");
    try {
      const { fn: embed } = embedder();
      const a = await extract(db, input(), { structured: model(OUTPUT), embed });
      const b = await extract(db, input({ variant: "__test_other" }), { structured: model(OUTPUT), embed });
      expect(b.id).not.toBe(a.id);
      expect(b.promptVersion).not.toBe(a.promptVersion);
      expect(b.coreVersion).toBe(a.coreVersion);
    } finally {
      rmSync(other, { force: true });
    }
  });

  it("stores core_version beside prompt_version so a core query is a WHERE", async () => {
    const { fn: embed } = embedder();
    const run = await extract(db, input(), { structured: model(OUTPUT), embed });
    const atCore = await db
      .select()
      .from(extractionRuns)
      .where(and(eq(extractionRuns.coreVersion, run.coreVersion), eq(extractionRuns.status, "ok")));
    expect(atCore.length).toBeGreaterThan(0);
  });
});
