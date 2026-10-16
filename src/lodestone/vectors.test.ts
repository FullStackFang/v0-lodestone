import { describe, expect, it } from "vitest";
import { blockVector, type IdeaVector } from "./vectors";

const row = (block: string, embedding: number[]): IdeaVector => ({ id: block + embedding.join(), ideaId: "i", facet: "purpose", block, text: "", embedding });

describe("blockVector", () => {
  it("is the unit mean of that block's rows and ignores every other block", () => {
    const rows = [row("value_proposition", [1, 0, 0]), row("value_proposition", [0, 1, 0]), row("channels", [0, 0, 1])];
    const v = blockVector(rows, "value_proposition")!;
    expect(v[0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v[2]).toBe(0);
  });

  it("is null for a block with no rows", () => {
    expect(blockVector([row("channels", [0, 0, 1])], "value_proposition")).toBeNull();
    expect(blockVector([], "channels")).toBeNull();
  });
});
