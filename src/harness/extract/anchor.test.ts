import { describe, expect, it } from "vitest";
import { anchor } from "./anchor";

/** "the system" three times, each preceded by different words. */
const THREE = "We built the system for clinics. Later the system moved to wards. Finally the system shipped.";

function sliceOf(text: string, result: ReturnType<typeof anchor>) {
  if (!result.ok) throw new Error(`expected an anchor, got ${result.reason}`);
  return text.slice(result.start, result.end);
}

describe("anchor", () => {
  it("uses the prefix to pick the second of three occurrences", () => {
    const result = anchor(THREE, "the system", "clinics. Later");
    expect(sliceOf(THREE, result)).toBe("the system");
    expect(result.ok && result.start).toBe(THREE.indexOf("the system", 20));
    // Not the first occurrence.
    expect(result.ok && result.start).toBeGreaterThan(THREE.indexOf("the system"));
  });

  it("picks the third when the prefix names it", () => {
    const result = anchor(THREE, "the system", "wards. Finally");
    expect(result.ok && result.start).toBe(THREE.lastIndexOf("the system"));
  });

  it("calls a repeated quote with no usable prefix ambiguous", () => {
    expect(anchor(THREE, "the system", "")).toEqual({ ok: false, reason: "ambiguous" });
    expect(anchor(THREE, "the system", "nowhere in the text")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("takes a quote that occurs exactly once, prefix or not", () => {
    const text = "The trial ran for six weeks in rural clinics.";
    const found = anchor(text, "ran for six weeks");
    expect(sliceOf(text, found)).toBe("ran for six weeks");
    expect(sliceOf(text, anchor(text, "ran for six weeks", "The trial"))).toBe("ran for six weeks");
  });

  it("tolerates whitespace the model re-wrapped, when that is unique", () => {
    const text = "It cuts the time to a diagnosis in rural clinics.";
    const result = anchor(text, "cuts  the time\nto a diagnosis");
    expect(sliceOf(text, result)).toBe("cuts the time to a diagnosis");
  });

  it("calls an invented quote unanchored", () => {
    expect(anchor(THREE, "a claim nobody made")).toEqual({ ok: false, reason: "unanchored" });
    expect(anchor(THREE, "a claim nobody made", "Finally")).toEqual({ ok: false, reason: "unanchored" });
  });

  it("treats an empty quote as unanchored rather than matching everywhere", () => {
    expect(anchor(THREE, "")).toEqual({ ok: false, reason: "unanchored" });
  });

  it("anchors a quote at the very start, where the prefix is empty", () => {
    const text = "We built the system for clinics.";
    expect(sliceOf(text, anchor(text, "We built", ""))).toBe("We built");
  });

  it("keeps offsets in UTF-16 code units past an astral character", () => {
    const text = "🧪 the system shipped";
    const result = anchor(text, "the system");
    expect(result.ok && result.start).toBe(3);
    expect(sliceOf(text, result)).toBe("the system");
  });
});
