import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { BENCHES, loadBench } from "./registry";
import { loadPairs, previousP3, scorePair } from "./pairs";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("pairs.json", () => {
  it("holds fifteen to twenty labeled pairs, mostly cofounder", () => {
    const pairs = loadPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(15);
    expect(pairs.length).toBeLessThanOrEqual(20);
    const cofounder = pairs.filter((p) => p.edge_type === "cofounder");
    expect(cofounder.length).toBeGreaterThan(pairs.length / 2);
    for (const pair of pairs) {
      expect(pair.note.length, JSON.stringify(pair)).toBeGreaterThan(10);
      expect((pair.should?.length ?? 0) + (pair.should_not?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it("pits the two hypotheses against each other at least twice", () => {
    const hypotheses = loadPairs().filter((p) => /hypothesis/.test(p.note));
    expect(hypotheses.length).toBeGreaterThanOrEqual(2);
  });

  it("names all three edge types", () => {
    const edges = new Set(loadPairs().map((p) => p.edge_type));
    expect([...edges].sort()).toEqual(["cofounder", "competitor", "mentor"]);
  });
});

describe("scorePair", () => {
  const pair = { edge_type: "cofounder" as const, query: "q", should: ["a"], should_not: ["z"], note: "n" };

  it("scores a hit at rank three as a hit", () => {
    expect(scorePair(["x", "y", "a", "z"], pair)).toEqual({ p3: 1, rr: 1 / 3, violations: 0 });
  });

  it("scores a miss as zero, with reciprocal rank zero when it never appears", () => {
    expect(scorePair(["x", "y", "w"], pair)).toEqual({ p3: 0, rr: 0, violations: 0 });
  });

  it("counts a should_not that reached the top three", () => {
    expect(scorePair(["z", "a", "y"], pair).violations).toBe(1);
    expect(scorePair(["y", "a", "x", "z"], pair).violations).toBe(0);
  });

  it("a pair with only should_not scores no P@3 at all", () => {
    const negative = { ...pair, should: undefined };
    expect(scorePair(["z", "y"], negative)).toEqual({ p3: null, rr: null, violations: 1 });
  });
});

describe("previousP3", () => {
  it("reads the last row per edge out of the results file", () => {
    const markdown = [
      "| P@3 0.500 (cofounder) | 11 | [0.2, 0.8] |",
      "| P@3 0.833 (cofounder) | 11 | [0.6, 1.0] |",
      "| fit: λ=0.15 headline=specific MRR 0.700 | — | — |",
    ].join("\n");
    expect(previousP3(markdown).get("cofounder")).toBe(0.833);
    expect(previousP3("").size).toBe(0);
  });
});

describe("the registry", () => {
  it("registered `pairs` before this change landed, and now finds it", async () => {
    expect(BENCHES).toContain("pairs");
    expect(await loadBench("pairs")).toBeTypeOf("function");
  });

  it("refuses to write a row when nothing is embedded", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pairsBench } = await import("./pairs");
    await pairsBench(db, []);
    const said = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    expect(said).toMatch(/no embedded assertions/);
    expect(said).toMatch(/No row was written/);
  });
});
