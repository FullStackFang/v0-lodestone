import { describe, expect, it } from "vitest";
import { validateResource } from "./validation";
import { matchResource } from "./matching";

export const resourceInput = {
  kind: "paper", title: "Low power sensing", sourceUrl: "https://example.edu/paper/1",
  identifier: "paper-1", sourceDate: "2026-01-02",
  rawText: "The sensor monitors water quality. It uses optical sensing. Testing needs laboratory calibration.",
  claims: [
    { facet: "purpose", text: "Monitor water quality", quote: "The sensor monitors water quality.", prefix: "" },
    { facet: "method", text: "Optical sensing", quote: "It uses optical sensing.", prefix: "water quality." },
    { facet: "limitations", text: "Needs laboratory calibration", quote: "Testing needs laboratory calibration.", prefix: "optical sensing." },
  ],
  proposals: ["Could perhaps help remote clinics"],
};

describe("curated research validation", () => {
  it("anchors every claim to canonical source text", () => {
    const parsed = validateResource(resourceInput);
    expect(parsed.claims[0]).toMatchObject({ quote: "The sensor monitors water quality.", startOff: 0, endOff: 34 });
    expect(parsed.canonicalText.slice(parsed.claims[1].startOff, parsed.claims[1].endOff)).toBe("It uses optical sensing.");
  });
  it("rejects a plausible claim with a fabricated quotation", () => {
    expect(() => validateResource({ ...resourceInput, claims: [{ facet: "result", text: "Works everywhere", quote: "Works everywhere", prefix: "" }] })).toThrow(/quote/i);
  });
  it("rejects invalid URLs, unsupported source kinds and missing source dates", () => {
    for (const patch of [{ sourceUrl: "javascript:alert(1)" }, { kind: "website" }, { sourceDate: "yesterday" }]) {
      expect(() => validateResource({ ...resourceInput, ...patch })).toThrow();
    }
  });
  it("preserves the original pasted source beside its normalized reading", () => {
    const rawText = `  ${resourceInput.rawText}\n`;
    const resource = validateResource({ ...resourceInput, rawText });
    expect(resource.rawText).toBe(rawText);
    expect(resource.canonicalText).toBe(resourceInput.rawText);
  });
});

describe("need to resource lexical baseline", () => {
  it("returns source snippets and stated limitations without claiming validated fit", () => {
    const match = matchResource({ title: "Water quality monitoring", criteria: "Optical sensor" }, validateResource(resourceInput));
    if (!match) throw new Error("Expected cited research candidate");
    expect(match.score).toBeGreaterThan(0);
    expect(match.explanation.snippets[0].quote).toBe("The sensor monitors water quality.");
    expect(match.explanation.limitations).toContain("Testing needs laboratory calibration.");
    expect(match.explanation.nextAction).toMatch(/criteria/i);
  });
  it("never matches a curator hypothesis or an unrelated idea", () => {
    const resource = validateResource(resourceInput);
    expect(matchResource({ title: "Remote clinics", criteria: "staff scheduling" }, resource)).toBeNull();
    expect(matchResource({ title: "Restaurants", criteria: "table reservation" }, resource)).toBeNull();
  });
  it("matches quoted evidence rather than a curator's unsupported paraphrase", () => {
    const resource = validateResource({ ...resourceInput, claims: resourceInput.claims.map((claim) => ({ ...claim, text: "Remote clinic staffing" })) });
    expect(matchResource({ title: "Remote clinic", criteria: "staffing" }, resource)).toBeNull();
  });
  it("explains applicability and limitations using anchored quotes, not unverified paraphrases", () => {
    const resource = validateResource({
      ...resourceInput,
      claims: [
        ...resourceInput.claims.map((claim) => claim.facet === "limitations" ? { ...claim, text: "No calibration required" } : claim),
        { facet: "conditions", text: "Ready for home use", quote: "Testing needs laboratory calibration.", prefix: "optical sensing." },
        { facet: "equipment", text: "No equipment needed", quote: "It uses optical sensing.", prefix: "water quality." },
        { facet: "access", text: "Available immediately", quote: "Testing needs laboratory calibration.", prefix: "optical sensing." },
      ],
    });
    const match = matchResource({ title: "Water quality monitoring", criteria: "Optical sensor" }, resource);
    expect(match?.explanation.applicability).toEqual([
      "conditions: Testing needs laboratory calibration.",
      "equipment: It uses optical sensing.",
      "access: Testing needs laboratory calibration.",
    ]);
    expect(match?.explanation.limitations).toEqual(["Testing needs laboratory calibration."]);
  });
});
