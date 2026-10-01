import { describe, expect, it } from "vitest";
import type { AssertionRow, MatchResultRow } from "@/db/schema";
import { matchRationale } from "./me";

describe("match rationale", () => {
  it("separates shared ideas from a capability answering an explicitly stated need", () => {
    const mine = [
      { id: "need", facet: "mechanism_sought", text: "Dental distribution" },
      { id: "purpose", facet: "purpose", text: "Recover empty chair time" },
    ] as AssertionRow[];
    const theirs = [
      { id: "capability", facet: "mechanism_commanded", text: "Sold to 30 dental practices" },
      { id: "idea", facet: "purpose", text: "Fill cancelled appointments" },
    ] as AssertionRow[];
    const result = { components: { contributors: {
      coverage: { query: "need", candidate: "capability" },
      purpose: { query: "purpose", candidate: "idea" },
    } } } as unknown as MatchResultRow;
    expect(matchRationale(result, mine, theirs)).toEqual({
      complementary: [{ need: "Dental distribution", capability: "Sold to 30 dental practices" }],
      sharedIdeas: [{ yours: "Recover empty chair time", theirs: "Fill cancelled appointments" }],
    });
    expect(matchRationale(result, mine.filter((r) => r.id !== "need"), theirs).complementary).toEqual([]);
  });
});
