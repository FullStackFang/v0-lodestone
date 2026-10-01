import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, extractionRuns } from "@/db/schema";
import { putArtifactText } from "../canonical";

let dir: string;
const appended: { bench: string; headline: string; n?: number; ci?: [number, number] }[] = [];

/** `appendResult` writes to the repo; the bench under test writes to a temp
 *  directory and records what it was asked to write. */
vi.mock("./results", async () => {
  const actual = await vi.importActual<typeof import("./results")>("./results");
  return {
    ...actual,
    appendResult: (result: Parameters<typeof actual.appendResult>[0]) => {
      appended.push(result as never);
      return actual.appendResult(result, dir);
    },
  };
});

const { run } = await import("./vocab");

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

// One database, emptied between tests: opening a PGlite applies both
// migrations, and this file needs six clean ledgers, not six databases.
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "vocab-bench-"));
  appended.length = 0;
  await db.delete(extractionRuns);
  await db.delete(artifactTexts);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function seed(rows: { variant: string; promptVersion: string; stats: Record<string, unknown> }[]) {
  const { textHash } = await putArtifactText(db, {
    artifactId: "50000000-0000-4000-8000-000000000001",
    sourceFormat: "abstract",
    parser: "test",
    text: "A text to hang runs on.",
  });
  for (const [at, row] of rows.entries()) {
    await db.insert(extractionRuns).values({
      textHash,
      variant: row.variant,
      promptVersion: row.promptVersion,
      coreVersion: "c".repeat(64),
      model: "cli:claude-opus-5",
      attempt: at + 1,
      status: "ok",
      stats: row.stats as never,
      usage: { output_tokens: 100 },
      createdAt: new Date(Date.now() + at * 1000),
    });
  }
  return textHash;
}

const stats = (count: number, distinct: number) => ({
  unanchored: 0,
  ambiguous: 0,
  dropped_invalid: 0,
  embedded: true,
  "mechanism.product": { count, distinct, mean_len: 30, not_stated: 0 },
});

describe("the vocab bench", () => {
  it("says so and appends nothing on an empty ledger", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ args: [], db });
    expect(log).toHaveBeenCalledWith("no runs");
    expect(appended).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("groups by (variant, prompt_version) and counts runs as n", async () => {
    await seed([
      { variant: "abstract", promptVersion: "a".repeat(64), stats: stats(5, 4) },
      { variant: "abstract", promptVersion: "a".repeat(64), stats: stats(5, 4) },
      { variant: "abstract", promptVersion: "b".repeat(64), stats: stats(5, 2) },
    ]);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => lines.push(args.join(" ")));
    await run({ args: [], db });

    expect(appended).toHaveLength(1);
    expect(appended[0].n).toBe(1);
    expect(appended[0].headline).toContain("mechanism.product 0.40");
    expect(appended[0].ci).toBeDefined();
    // Two groups printed, the newest last.
    expect(lines.filter((l) => l.includes("abstract @"))).toHaveLength(2);
    expect(readFileSync(path.join(dir, "vocab.md"), "utf8")).toContain("mechanism.product 0.40");
  });

  it("shows the collapse as a delta against the previous version of the variant", async () => {
    await seed([
      { variant: "abstract", promptVersion: "a".repeat(64), stats: stats(5, 4) },
      { variant: "abstract", promptVersion: "b".repeat(64), stats: stats(5, 2) },
    ]);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => lines.push(args.join(" ")));
    await run({ args: [], db });

    const delta = lines.find((l) => l.includes("mechanism.product") && l.includes("0.40"))!;
    expect(delta).toMatch(/2 \/ 5 = 0\.40/);
    expect(delta).toMatch(/−0\.40/);
  });

  it("filters to one variant when asked", async () => {
    await seed([
      { variant: "abstract", promptVersion: "a".repeat(64), stats: stats(5, 4) },
      { variant: "deck", promptVersion: "d".repeat(64), stats: stats(4, 1) },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ args: ["--variant", "abstract"], db });
    expect(appended[0].headline).toContain("0.80");
  });

  it("ignores runs that never finished", async () => {
    const textHash = await seed([{ variant: "abstract", promptVersion: "a".repeat(64), stats: stats(5, 4) }]);
    await db.insert(extractionRuns).values({
      textHash,
      variant: "abstract",
      promptVersion: "a".repeat(64),
      coreVersion: "c".repeat(64),
      model: "cli:claude-opus-5",
      attempt: 99,
      status: "failed",
      error: "timeout",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ args: [], db });
    expect(appended[0].n).toBe(1);
  });

  it("hangs its runs on a real artifact text", async () => {
    await seed([{ variant: "abstract", promptVersion: "a".repeat(64), stats: stats(1, 1) }]);
    expect(await db.select().from(artifactTexts)).toHaveLength(1);
  });
});
