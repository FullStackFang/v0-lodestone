import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendResult } from "./results";
import { ensureHeader } from "./gold";
import { alreadyRun } from "./final";

const VERSION = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const MODEL = "cli:claude-opus-5";

function resultsDir(): string {
  return mkdtempSync(path.join(tmpdir(), "results-"));
}

describe("alreadyRun", () => {
  it("is null before the first row", () => {
    const dir = resultsDir();
    expect(alreadyRun(VERSION, MODEL, path.join(dir, "final.md"))).toBeNull();
  });

  it("finds the row for a version already read, and names it", () => {
    const dir = resultsDir();
    appendResult(
      { bench: "final", headline: "0.612", n: 9, ci: [0.5, 0.7], promptVersion: VERSION, model: MODEL },
      dir,
    );
    const standing = alreadyRun(VERSION, MODEL, path.join(dir, "final.md"));
    expect(standing).toContain("0.612");
    expect(standing).toContain(VERSION.slice(0, 12));
  });

  it("lets a different prompt version through", () => {
    const dir = resultsDir();
    appendResult(
      { bench: "final", headline: "0.612", n: 9, ci: [0.5, 0.7], promptVersion: VERSION, model: MODEL },
      dir,
    );
    const other = `f${VERSION.slice(1)}`;
    expect(alreadyRun(other, MODEL, path.join(dir, "final.md"))).toBeNull();
  });

  it("lets the same prompt on a different model through", () => {
    const dir = resultsDir();
    appendResult(
      { bench: "final", headline: "0.612", n: 9, ci: [0.5, 0.7], promptVersion: VERSION, model: MODEL },
      dir,
    );
    expect(alreadyRun(VERSION, "api:claude-sonnet-5", path.join(dir, "final.md"))).toBeNull();
  });
});

describe("the results header", () => {
  it("is written once, above the numbers", () => {
    const dir = resultsDir();
    ensureHeader("gold", "# Bench results — gold\n\nThe reader who makes this gold edits the prompt.\n", dir);
    appendResult({ bench: "gold", headline: "0.5", n: 2, ci: [0.4, 0.6] }, dir);
    ensureHeader("gold", "# something else\n", dir);

    const text = readFileSync(path.join(dir, "gold.md"), "utf8");
    expect(text.startsWith("# Bench results — gold")).toBe(true);
    expect(text).toContain("edits the prompt");
    expect(text).not.toContain("something else");
    expect(text).toContain("| 0.5 |");
  });

  it("does not disturb a file that already has rows", () => {
    const dir = resultsDir();
    writeFileSync(path.join(dir, "gold.md"), "# existing\n", "utf8");
    ensureHeader("gold", "# replacement\n", dir);
    expect(readFileSync(path.join(dir, "gold.md"), "utf8")).toBe("# existing\n");
  });
});
