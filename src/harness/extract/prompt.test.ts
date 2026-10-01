import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assembleExtractPrompt } from "./prompt";

const DIR = path.join(process.cwd(), "prompts", "extract");
const scratch = path.join(DIR, "__test_variant.md");

afterEach(() => {
  rmSync(scratch, { force: true });
});

describe("assembleExtractPrompt", () => {
  it("names the missing file", () => {
    expect(() => assembleExtractPrompt("nonesuch")).toThrow(/prompts\/extract\/nonesuch\.md/);
  });

  it("moves prompt_version and not core_version when the variant changes", () => {
    writeFileSync(scratch, "# Variant one\n", "utf8");
    const first = assembleExtractPrompt("__test_variant");
    writeFileSync(scratch, "# Variant one, revised\n", "utf8");
    const second = assembleExtractPrompt("__test_variant");

    expect(second.promptVersion).not.toBe(first.promptVersion);
    expect(second.coreVersion).toBe(first.coreVersion);
    expect(second.blocks).toHaveLength(2);
    expect(second.blocks[0]).toBe(first.blocks[0]);
  });

  it("puts the core first and the variant second, joined the way a turn is", () => {
    writeFileSync(scratch, "# Variant\n", "utf8");
    const { blocks, system } = assembleExtractPrompt("__test_variant");
    expect(system).toBe(`${blocks[0]}\n\n---\n\n${blocks[1]}`);
    expect(blocks[0]).toContain("You are an instrument, not a summarizer.");
  });

  it("reads only ladder.md for the ladder, and hashes it as both versions", () => {
    const ladder = assembleExtractPrompt("ladder");
    expect(ladder.blocks).toHaveLength(1);
    expect(ladder.promptVersion).toBe(ladder.coreVersion);
    expect(ladder.blocks[0]).toContain("The purpose ladder");
    expect(ladder.promptVersion).not.toBe(assembleExtractPrompt("ladder").coreVersion.slice(1));
  });

  it("marks both shipped prompts as defaults the loop edits", () => {
    for (const name of ["core", "ladder"]) {
      const text = readFileSync(path.join(DIR, `${name}.md`), "utf8");
      expect(text).toMatch(/A DEFAULT, NOT A CONSTANT/);
      expect(text).toMatch(/prompt_version/);
    }
  });
});
