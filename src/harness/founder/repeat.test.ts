import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { embed } from "@/harness/embed";
import { REPEAT_THRESHOLD, cosine, sameClaim } from "./repeat";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "founder", "repeat-fixture.json"), "utf8"),
) as {
  threshold: number;
  pairs: { label: "same" | "different"; note: string; a: string; b: string }[];
  equal: { a: string; b: string }[];
};

const hasKey = Boolean(process.env.VOYAGE_API_KEY?.trim());

describe("REPEAT_THRESHOLD", () => {
  it("is the value the fixture was labeled against", () => {
    expect(REPEAT_THRESHOLD).toBe(fixture.threshold);
  });

  it("treats normalized-equal text as a repeat with or without vectors", () => {
    for (const { a, b } of fixture.equal) {
      expect(sameClaim(a, b, null, null)).toBe(true);
    }
  });

  it("says nothing about two different claims when neither is embedded", () => {
    const [, different] = fixture.pairs;
    expect(sameClaim(different.a, different.b, null, null)).toBe(false);
  });

  it("computes cosine on unit vectors exactly", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 12);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 12);
  });

  // The pairs are what set the threshold, and setting it needs the real
  // embedding space. Without a key the assertion would be about a fake.
  it.skipIf(!hasKey)("separates the labeled pairs", async () => {
    for (const pair of fixture.pairs) {
      const { vectors } = await embed([pair.a, pair.b]);
      const [va, vb] = vectors;
      expect(sameClaim(pair.a, pair.b, va, vb), `${pair.label}: ${pair.note}`).toBe(pair.label === "same");
    }
  });
});
