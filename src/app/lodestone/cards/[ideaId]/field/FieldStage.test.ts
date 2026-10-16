import { describe, expect, it } from "vitest";
import { ease, wrapLines } from "./FieldStage";

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

describe("wrapLines", () => {
  const width = (s: string) => s.length * 10;
  it("breaks on spaces when a line would exceed the width", () => {
    expect(wrapLines(width, "ab cd ef", 50)).toEqual(["ab cd", "ef"]);
  });
  it("splits a word wider than the tile by characters instead of overflowing", () => {
    const lines = wrapLines(width, "x".repeat(30), 100);
    expect(lines.join("")).toBe("x".repeat(30));
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(100);
    expect(lines.length).toBe(3);
  });
  it("keeps a 120-character title inside the width on every line", () => {
    const title = `${"Cold".repeat(20)} ${"chain".repeat(8)}`;
    for (const line of wrapLines(width, title, 260)) expect(width(line)).toBeLessThanOrEqual(260);
  });
});
