import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendResult } from "./results";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "harness-results-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const today = new Date().toISOString().slice(0, 10);

describe("appendResult", () => {
  it("creates the file with a header, today's section and the row", () => {
    const file = appendResult({ bench: "gold", headline: "token F1 0.71" }, dir);
    const text = readFileSync(file, "utf8");
    expect(text).toMatch(/^# Bench results — gold/);
    expect(text).toContain(`## ${today}`);
    expect(text).toContain("| headline | n | ci95 |");
    expect(text).toContain("| token F1 0.71 |");
  });

  it("appends and never rewrites", () => {
    const file = appendResult({ bench: "gold", headline: "first" }, dir);
    const after = readFileSync(file, "utf8");
    appendResult({ bench: "gold", headline: "second" }, dir);
    const text = readFileSync(file, "utf8");
    expect(text.startsWith(after)).toBe(true);
    expect(text.split("\n").filter((l) => l.startsWith("| first"))).toHaveLength(1);
    expect(text.split("\n").filter((l) => l.startsWith("| second"))).toHaveLength(1);
    // One dated section, not two.
    expect(text.split(`## ${today}`)).toHaveLength(2);
  });

  it("gives two benches two files and touches neither the other's", () => {
    appendResult({ bench: "gold", headline: "g" }, dir);
    appendResult({ bench: "pairs", headline: "p" }, dir);
    expect(readdirSync(dir).sort()).toEqual(["gold.md", "pairs.md"]);
    expect(readFileSync(path.join(dir, "gold.md"), "utf8")).not.toContain("| p |");
    expect(readFileSync(path.join(dir, "pairs.md"), "utf8")).not.toContain("| g |");
  });

  it("prints unknown tokens rather than zero", () => {
    const file = appendResult({ bench: "vocab", headline: "h", tokens: null }, dir);
    expect(readFileSync(file, "utf8")).toContain("| unknown | unknown |");
    const withTokens = appendResult({ bench: "vocab", headline: "h2", tokens: 0 }, dir);
    expect(readFileSync(withTokens, "utf8")).toContain("| h2 |");
    expect(readFileSync(withTokens, "utf8")).toMatch(/\| h2 \|.*\| 0 \|/);
  });

  it("shortens prompt fingerprints to twelve hex characters", () => {
    const file = appendResult(
      { bench: "coda", headline: "h", promptVersion: "a".repeat(64), coreVersion: "b".repeat(64) },
      dir,
    );
    const text = readFileSync(file, "utf8");
    expect(text).toContain(`| ${"a".repeat(12)} | ${"b".repeat(12)} |`);
    expect(text).not.toContain("a".repeat(13));
  });

  it("refuses a mean over n items with no interval", () => {
    expect(() => appendResult({ bench: "gold", headline: "h", n: 10 }, dir)).toThrow(/95% interval/);
    const file = appendResult({ bench: "gold", headline: "h", n: 10, ci: [0.6, 0.8] }, dir);
    expect(readFileSync(file, "utf8")).toContain("| 10 | [0.600, 0.800] |");
  });
});
