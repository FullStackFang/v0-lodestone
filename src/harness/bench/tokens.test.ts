import { describe, expect, it } from "vitest";
import { bootstrap, classOf, jaccard, labelTokens, score, tokenize } from "./tokens";

/** Twelve tokens, so "tokens 3–8" and "tokens 5–10" are expressible. */
const TEXT = "zero one two three four five six seven eight nine ten eleven";
const at = (i: number) => {
  const items = tokenize(TEXT);
  return items[i];
};
/** A span covering tokens `[i, j]` inclusive, the way a highlight would. */
const over = (i: number, j: number, facet = "purpose") => ({
  start: at(i).start,
  end: at(j).end,
  facet,
});

describe("tokenize", () => {
  it("gives every token its code-unit offsets", () => {
    const items = tokenize("  a  bb ");
    expect(items).toEqual([
      { start: 2, end: 3, text: "a" },
      { start: 5, end: 7, text: "bb" },
    ]);
    expect(tokenize("")).toEqual([]);
  });

  it("counts an astral character as two units", () => {
    const items = tokenize("🧪 tail");
    expect(items[0]).toEqual({ start: 0, end: 2, text: "🧪" });
    expect(items[1].start).toBe(3);
  });
});

describe("classOf", () => {
  it("folds every mechanism subtype onto one axis and ignores the rest", () => {
    expect(classOf("purpose")).toBe("purpose");
    expect(classOf("mechanism")).toBe("mechanism");
    expect(classOf("mechanism.revenue")).toBe("mechanism");
    expect(classOf("constraint")).toBeNull();
    expect(classOf(null)).toBeNull();
  });
});

describe("labelTokens", () => {
  it("labels a token by what covers its start", () => {
    const labels = labelTokens(TEXT, [over(3, 5)]);
    expect(labels.purpose.slice(0, 8)).toEqual([false, false, false, true, true, true, false, false]);
  });

  it("lets a token belong to both classes at once", () => {
    const labels = labelTokens(TEXT, [over(2, 4, "purpose"), over(3, 6, "mechanism.product")]);
    expect(labels.purpose[3]).toBe(true);
    expect(labels.mechanism[3]).toBe(true);
  });
});

describe("score", () => {
  it("gives partial credit for a partial overlap and nothing for the span", () => {
    // Gold tokens 3–8, run tokens 5–10: four shared of six each way.
    const result = score(TEXT, [over(3, 8)], [over(5, 10)]);
    expect(result.token.purpose.precision).toBeCloseTo(4 / 6, 10);
    expect(result.token.purpose.recall).toBeCloseTo(4 / 6, 10);
    expect(result.span.purpose.f1).toBe(0);
  });

  it("does not let one giant span win", () => {
    const gold = [over(1, 1), over(4, 4), over(8, 8)];
    const giant = [{ start: 0, end: TEXT.length, facet: "purpose" }];
    const result = score(TEXT, gold, giant);

    expect(result.token.purpose.recall).toBe(1);
    expect(result.span.purpose.f1).toBe(0);
    expect(result.headline).toBeLessThan(result.token.purpose.f1);
  });

  it("scores an exact match as one", () => {
    const spans = [over(1, 2), over(5, 6, "mechanism")];
    const result = score(TEXT, spans, spans);
    expect(result.headline).toBe(1);
    expect(result.token.mechanism.f1).toBe(1);
    expect(result.span.mechanism.f1).toBe(1);
  });

  it("reads an empty class on both sides as agreement, not failure", () => {
    const result = score(TEXT, [over(0, 1)], [over(0, 1)]);
    expect(result.token.mechanism.f1).toBe(1);
    expect(result.token.mechanism.gold).toBe(0);
  });

  it("scores a class the run invented as zero", () => {
    const result = score(TEXT, [over(0, 1)], [over(0, 1), over(4, 5, "mechanism")]);
    expect(result.token.mechanism.f1).toBe(0);
    expect(result.token.mechanism.predicted).toBe(2);
  });
});

describe("bootstrap", () => {
  it("returns the mean with an interval that widens as n falls", () => {
    const many = bootstrap([0.5, 0.6, 0.4, 0.55, 0.45, 0.5, 0.52, 0.48, 0.51, 0.49]);
    const few = bootstrap([0.2, 0.9, 0.4]);
    expect(many.n).toBe(10);
    expect(many.mean).toBeCloseTo(0.5, 2);
    expect(many.ci[0]).toBeLessThanOrEqual(many.mean);
    expect(many.ci[1]).toBeGreaterThanOrEqual(many.mean);
    expect(few.ci[1] - few.ci[0]).toBeGreaterThan(many.ci[1] - many.ci[0]);
  });

  it("is seeded, so a re-run of the same numbers prints the same interval", () => {
    expect(bootstrap([1, 2, 3, 4]).ci).toEqual(bootstrap([1, 2, 3, 4]).ci);
  });
});

describe("jaccard", () => {
  it("is the token overlap the bench would compute", () => {
    expect(jaccard(TEXT, over(3, 8), over(5, 10))).toBeCloseTo(4 / 8, 10);
    expect(jaccard(TEXT, over(0, 2), over(0, 2))).toBe(1);
    expect(jaccard(TEXT, over(0, 1), over(5, 6))).toBe(0);
  });
});
