import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FOLDS, HELD_OUT, fold, isHeldOut, isTraining } from "./fold";

const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("fold", () => {
  it("is the first four bytes of the hash, modulo five", () => {
    const h = "0000000a" + "0".repeat(56);
    expect(fold(h)).toBe(10 % FOLDS);
  });

  it("is stable — the same text always lands in the same fold", () => {
    const h = hash("an abstract about clinics");
    expect(fold(h)).toBe(fold(h));
    expect(fold(h)).toBe(fold(hash("an abstract about clinics")));
  });

  it("spreads across all five folds", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(fold(hash(`abstract ${i}`)));
    expect(seen.size).toBe(FOLDS);
  });

  it("never calls a fold-0 text training, and never the reverse", () => {
    for (let i = 0; i < 200; i++) {
      const h = hash(`abstract ${i}`);
      expect(isTraining(h)).toBe(fold(h) !== HELD_OUT);
      expect(isHeldOut(h)).toBe(!isTraining(h));
    }
  });

  it("holds out about a fifth of a corpus", () => {
    const hashes = Array.from({ length: 500 }, (_, i) => hash(`paper ${i}`));
    const held = hashes.filter(isHeldOut).length;
    expect(held).toBeGreaterThan(60);
    expect(held).toBeLessThan(140);
  });
});
