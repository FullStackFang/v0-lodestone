import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { STAGES } from "./stages";
import { assemblePrompt, fallbackQuestion } from "./prompt";

const segmentFile = path.join(process.cwd(), "prompts", "segment.md");
const original = readFileSync(segmentFile, "utf8");

afterEach(() => writeFileSync(segmentFile, original));

describe("assemblePrompt", () => {
  it("every stage has a module, a fallback, and two system blocks", () => {
    for (const s of STAGES) {
      const p = assemblePrompt(s);
      expect(p.system).toHaveLength(2);
      expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(p.system[1].text).toContain(`# Stage — ${s}`);
      expect(p.promptVersion).toMatch(/^[0-9a-f]{64}$/);
      expect(fallbackQuestion(s)).toMatch(/\?$/);
    }
  });

  it("editing one stage file changes only that stage's version", () => {
    const before = Object.fromEntries(STAGES.map((s) => [s, assemblePrompt(s).promptVersion]));
    appendFileSync(segmentFile, "\nx");
    const after = Object.fromEntries(STAGES.map((s) => [s, assemblePrompt(s).promptVersion]));
    expect(after.segment).not.toBe(before.segment);
    for (const s of STAGES) if (s !== "segment") expect(after[s]).toBe(before[s]);
  });

  it("fallback is one line, not the whole section", () => {
    expect(fallbackQuestion("kill")).not.toContain("\n");
    expect(fallbackQuestion("kill")).toMatch(/^What is the one thing/);
  });
});
