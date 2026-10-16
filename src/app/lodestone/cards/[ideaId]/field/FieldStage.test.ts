import { describe, expect, it } from "vitest";
import { ease } from "./FieldStage";

describe("ease", () => {
  it("reaches exactly 1 at the end so the entrance loop can stop", () => {
    expect(ease(1)).toBe(1);
    expect(ease(1.5)).toBe(1);
  });
  it("starts at 0 and rises monotonically", () => {
    expect(ease(-0.5)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeGreaterThan(0.9);
    expect(ease(0.5)).toBeLessThan(1);
  });
});
