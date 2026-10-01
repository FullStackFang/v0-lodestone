import { describe, expect, it } from "vitest";
import { bootstrapCI } from "./stats";

const TEN = [0.4, 0.55, 0.6, 0.62, 0.68, 0.7, 0.72, 0.78, 0.85, 0.9];

describe("bootstrapCI", () => {
  it("is deterministic under a seed", () => {
    const a = bootstrapCI(TEN, { iterations: 1000, seed: 7 });
    const b = bootstrapCI(TEN, { iterations: 1000, seed: 7 });
    expect(a).toEqual(b);
    const other = bootstrapCI(TEN, { iterations: 1000, seed: 8 });
    expect(other.ci).not.toEqual(a.ci);
    expect(other.mean).toBe(a.mean);
  });

  it("brackets the mean and reports n", () => {
    const { mean, ci, n } = bootstrapCI(TEN, { seed: 1 });
    expect(n).toBe(10);
    expect(mean).toBeCloseTo(0.68, 5);
    expect(ci[0]).toBeLessThan(mean);
    expect(ci[1]).toBeGreaterThan(mean);
  });

  it("is wide at ten items and narrower at a hundred", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => TEN[i % 10]);
    const small = bootstrapCI(TEN, { seed: 3 });
    const large = bootstrapCI(hundred, { seed: 3 });
    expect(large.ci[1] - large.ci[0]).toBeLessThan(small.ci[1] - small.ci[0]);
  });

  it("handles the degenerate sizes", () => {
    expect(bootstrapCI([], { seed: 1 })).toEqual({ mean: 0, ci: [0, 0], n: 0 });
    expect(bootstrapCI([0.5], { seed: 1 })).toEqual({ mean: 0.5, ci: [0.5, 0.5], n: 1 });
  });
});
